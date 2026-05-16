# Design Log #054: MCP Gateway — Phase 1 (Registry, Proxy, Audit)

## Background

AgentInSync currently exposes its own knowledge base via an MCP server (`packages/mcp-server`). AI
agents connect to it directly using an `ask_` API key and call tools like `search_before_fixing` and
`submit_after_solving`. This works well for AgentInSync's own tools.

The problem: enterprises need their AI agents to connect to _many_ tools — GitHub, Jira, Slack,
internal databases, custom APIs — not just AgentInSync's knowledge base. Today there is no governed
way to do that. Developers run local, unmonitored MCP servers with hardcoded credentials, no audit
trail, and no access controls. Security teams cannot see what tools agents are using or what data is
flowing through them.

This design introduces the **MCP Gateway**: a secure, governed proxy that sits between AI agents and
upstream MCP servers. Every tool call from an agent passes through the gateway. The gateway enforces
policy, manages credentials, and records a full audit trail — without agents needing to change how
they call tools.

This document covers **Phase 1** only: the server type registry, the credential model, the TypeScript
data plane proxy, and the basic audit log. RBAC/ABAC enforcement, PII masking, the LLM semantic guard,
SCIM provisioning, and the open connector SDK are covered in subsequent design logs.

## Problem

1. **Unmanaged credentials**: Developers put API keys directly in MCP server configs or agent prompts.
   Keys are never rotated, never scoped, and when a developer leaves the company, they take the key.

2. **No audit trail**: There is no record of which agent called which tool, with which parameters, at
   what time. Compliance teams cannot answer "what data did the AI touch last month?"

3. **No admin control**: IT cannot approve or revoke access to external tools. Any developer can
   connect any MCP server to any agent.

4. **Economic exposure**: An unguarded MCP tool call can generate thousands of expensive output tokens
   or trigger destructive operations. There is no budget enforcement or output cap.

5. **AgentInSync is siloed**: The existing MCP server is a standalone tool. It cannot serve as the
   foundation for a broader platform where customers manage many connectors from one control point.

## Questions and Answers

> Q: Why build a custom proxy instead of using an existing API gateway (Kong, AWS API Gateway)?

A: General-purpose API gateways understand HTTP, not the MCP JSON-RPC protocol. They cannot inspect
tool names, validate JSON-RPC arguments, enforce tool-level policies, or manage per-user OAuth token
injection mid-request. MCP-aware enforcement requires an MCP-aware proxy.

> Q: Why TypeScript for the data plane instead of Go (as the team's blueprint recommends)?

A: The existing codebase is TypeScript. Building Phase 1 in TypeScript means the same team ships
faster, uses the same tooling, and the gateway can share Drizzle, Better Auth, and existing service
patterns without a cross-language boundary. The external interface (HTTP, JSON-RPC) is the same
regardless of language — when Go becomes necessary for performance at scale, it replaces only the
data plane package. The control plane API and plugin interface remain unchanged.

> Q: Why not merge gateway logic into the existing `packages/mcp-server`?

A: The existing MCP server exposes AgentInSync's own tools. The gateway is a different concern: it
proxies _external_ MCP servers. Mixing them couples two responsibilities and makes the open-platform
story (Phase 3) impossible — the connector SDK needs a clean package boundary to build against.
Keeping them separate means `packages/mcp-server` stays unchanged and `packages/mcp-gateway` is a
new, independently deployable package.

> Q: Should AgentInSync's own MCP server register itself as a gateway connector?

A: Yes, and this is the key integration point. AgentInSync's tools become the **first registered
connector** in the gateway. Every call to AgentInSync's tools routes through the gateway security
pipeline: auth, type check, credential resolution, audit logging. On day one, the gateway has a
working connector and the audit trail is already populated with real data. The "Agentic App Store"
launches with one pre-installed, pre-vetted app.

> Q: How are credentials stored safely if we don't have AWS KMS yet?

A: Phase 1 uses AES-256-GCM encryption with a 256-bit key sourced from `GATEWAY_ENCRYPTION_KEY`
env var. The encrypted ciphertext + IV are stored in the `mcpServerConnections` table. The raw key
never enters the database. This is the correct approach for Phase 1 — it satisfies the "secrets never
in plaintext" requirement and can be upgraded to envelope encryption (KMS-wrapped key) in Phase 3
without changing the schema column.

> Q: What happens when the upstream MCP server is the AgentInSync MCP server itself? Does the
> request loop?

A: No. The gateway resolves the upstream URL at request time from `mcpServerTypes.proxyUrl`. For
the AgentInSync connector, `proxyUrl` points to `packages/mcp-server` (port 3001). The gateway on
port 3002 forwards to port 3001. No loop occurs because the gateway listens on a different port and
only forwards — it does not process its own tool calls.

> Q: What is the credential model for the AgentInSync connector specifically?

A: `org_shared`. The connector uses the organization's existing `ask_` API key as the upstream
credential. The gateway injects it into the forwarded request header. Users do not need to manage a
separate connection — the org's existing key is the credential.

> Q: Phase 1 includes "basic guard" — what exactly is in scope?

A: Layer 0 only: static regex blocklists on request parameters (SQL DDL, shell execution, known
exfiltration patterns) and output size caps (byte limit on response before it reaches the agent).
The LLM semantic guard (Layer 2) is Phase 3. The distinction is important: Layer 0 is zero-latency
and requires no inference runtime. It ships in Phase 1. Layer 2 requires an inference runtime
decision (self-hosted Ollama vs cloud API) and operational experience from real traffic patterns
before the right choice is obvious.

## Design

### Package Structure

```
packages/
  mcp-server/     Unchanged — AgentInSync's own tools, port 3001
  mcp-gateway/    New — data plane proxy, port 3002
    src/
      server.ts           Express app + gateway endpoint
      middleware/
        auth.ts           Validate ask_ API key (reuse backend validateApiKey)
        guard.ts          Layer 0 static rules enforcement
      proxy/
        router.ts         Resolve server type → credential → forward request
        credential.ts     Decrypt and inject credentials into upstream request
        forwarder.ts      HTTP client that sends JSON-RPC to upstream MCP server
      audit/
        logger.ts         Write mcpAuditLog rows (async, never blocks response)
      types.ts
```

The gateway is a separate Express app. It does not import from `packages/mcp-server`. It imports
from `packages/backend` only for `validateApiKey` and organization-scoped DB queries.

### New Database Tables

All tables added to `packages/db-client/src/schema.ts`. Migrations generated via
`pnpm --filter @agent-in-sync/db-client db:generate` as required.

#### `mcpServerTypes` — Admin-approved connector catalog

```typescript
export const mcpServerTypes = pgTable('mcp_server_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(), // "GitHub", "SerpAPI", "AgentInSync KB"
  slug: text('slug').notNull(), // "github", "serpapi", "agent-in-sync-kb"
  proxyUrl: text('proxy_url').notNull(), // upstream MCP server URL
  credentialModel: credentialModelEnum('credential_model').notNull(),
  oauthConfig: jsonb('oauth_config'), // { clientId, authUrl, tokenUrl, scopes }
  toolManifest: jsonb('tool_manifest'), // cached tool list, refreshed periodically
  piiFields: jsonb('pii_fields'), // { "tool_name": ["param", "result_field"] }
  layer0Rules: jsonb('layer0_rules'), // [{ pattern, action: "block"|"flag" }]
  maxOutputBytes: integer('max_output_bytes'), // null = no cap
  status: serverTypeStatusEnum('status').notNull().default('pending_approval'),
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const credentialModelEnum = pgEnum('credential_model', [
  'org_shared',
  'per_user_oauth',
  'per_user_api_key',
]);

export const serverTypeStatusEnum = pgEnum('mcp_server_type_status', [
  'pending_approval',
  'approved',
  'suspended',
]);
```

#### `mcpServerConnections` — Encrypted credentials, org-scoped or user-scoped

```typescript
export const mcpServerConnections = pgTable('mcp_server_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverTypeId: uuid('server_type_id')
    .notNull()
    .references(() => mcpServerTypes.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id), // NULL = org-shared
  credentialType: credentialTypeEnum('credential_type').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(), // AES-256-GCM: "iv:ciphertext" base64
  encryptedRefresh: text('encrypted_refresh'), // OAuth refresh token, same encoding
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const credentialTypeEnum = pgEnum('credential_type', ['api_key', 'oauth_token']);
```

**Constraint enforced at application layer** (not DB constraint, to give clearer error messages):

- `credentialModel = org_shared` → exactly one row per `serverTypeId` with `userId IS NULL`
- `credentialModel = per_user_*` → one row per `(serverTypeId, userId)` combination

#### `mcpAuditLog` — Immutable audit trail

```typescript
export const mcpAuditLog = pgTable('mcp_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  agentId: uuid('agent_id').references(() => agents.id),
  apiKeyId: uuid('api_key_id').references(() => apiKeys.id),
  serverTypeId: uuid('server_type_id').references(() => mcpServerTypes.id),
  connectionId: uuid('connection_id').references(() => mcpServerConnections.id),
  toolName: text('tool_name'),
  requestParams: jsonb('request_params'), // Phase 2: PII fields masked
  responseStatus: integer('response_status'), // 200, 403, 500, etc.
  responseError: text('response_error'), // error message if failed
  durationMs: integer('duration_ms'),
  outputBytes: integer('output_bytes'), // bytes in response before any cap
  guardLayer: text('guard_layer'), // null | "layer0_static" | "layer1_size"
  guardAction: guardActionEnum('guard_action').notNull().default('passed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // no updatedAt — immutable
});

export const guardActionEnum = pgEnum('guard_action', [
  'passed',
  'blocked',
  'truncated', // response capped at maxOutputBytes
  'flagged', // passed but written to review queue
]);
```

### Request Flow

Every call to `POST /gateway/:orgSlug/:serverTypeSlug` follows this sequence:

```
1. Auth
   Extract X-API-Key header → validateApiKey() → { userId, organizationId, apiKeyId, agentId }
   Return 401 if invalid or expired.

2. Type resolution
   SELECT mcpServerTypes WHERE slug = :serverTypeSlug AND organizationId = :organizationId
   Return 404 if not found.
   Return 403 "Server type suspended" if status ≠ "approved".

3. Layer 0 guard — request side
   Parse JSON-RPC body → extract tool name and params.
   Run params against serverType.layer0Rules regex patterns.
   Run params against global platform blocklist (SQL DDL, shell execution, known exfiltration).
   Return 403 + write audit log (blocked) if any pattern matches.

4. Layer 1 guard — output size pre-check
   If serverType.maxOutputBytes is set, note it for enforcement after upstream call.

5. Credential resolution
   credentialModel = org_shared:
     SELECT mcpServerConnections WHERE serverTypeId AND organizationId AND userId IS NULL
   credentialModel = per_user_*:
     SELECT mcpServerConnections WHERE serverTypeId AND userId = :userId AND isActive = true
   Return 403 "No active connection" if none found.
   Decrypt encryptedSecret using GATEWAY_ENCRYPTION_KEY.

6. Forward
   Clone request body. Inject decrypted credential into upstream Authorization header.
   HTTP POST to serverType.proxyUrl with 30s timeout.
   Capture response body, status, and duration.

7. Layer 1 guard — output size enforcement
   If response body exceeds maxOutputBytes: truncate, set guardAction = "truncated".

8. Write audit log (async — does not block response)
   INSERT mcpAuditLog with all resolved fields.
   Update mcpServerConnections.lastUsedAt.

9. Return response to agent
```

### Encryption Scheme

```typescript
// packages/mcp-gateway/src/proxy/credential.ts

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.GATEWAY_ENCRYPTION_KEY!, 'hex'); // 32-byte key

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv):base64(tag):base64(ciphertext)
  return [iv, tag, encrypted].map(b => b.toString('base64')).join(':');
}

export function decrypt(stored: string): string {
  const [ivB64, tagB64, ctB64] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

The `GATEWAY_ENCRYPTION_KEY` is a 256-bit hex string (`openssl rand -hex 32`) stored in the
deployment environment, never in the database or repository.

### Layer 0 Global Blocklist

Applied to all requests regardless of org-level rules. Patterns are maintained in the gateway
codebase and updated without schema changes:

```typescript
// packages/mcp-gateway/src/middleware/guard.ts

const GLOBAL_PARAM_BLOCKLIST: RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bDELETE\s+FROM\b.*\bWHERE\s+1\s*=\s*1\b/i,
  /\bTRUNCATE\s+TABLE\b/i,
  /\brm\s+-rf\b/,
  /-----BEGIN\s+(RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/,
  /IGNORE\s+PREVIOUS\s+INSTRUCTIONS/i,
  /\[INST\]|\[\/INST\]/,
];

const GLOBAL_RESPONSE_BLOCKLIST: RegExp[] = [
  /IGNORE\s+PREVIOUS\s+INSTRUCTIONS/i,
  /SYSTEM\s*:/i,
  /-----BEGIN\s+(RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/,
  /<\|im_start\|>\s*system/i,
];
```

Org-level rules from `mcpServerTypes.layer0Rules` are appended at runtime, not merged into the
global list, so platform updates don't overwrite admin customizations.

### AgentInSync Connector — Seed Data

At startup (or via a one-time migration script), the AgentInSync connector is registered as the
first entry in `mcpServerTypes` for every organization:

```typescript
{
  name: 'AgentInSync Knowledge Base',
  slug: 'agent-in-sync-kb',
  proxyUrl: process.env.MCP_SERVER_URL ?? 'http://localhost:3001',
  credentialModel: 'org_shared',
  status: 'approved',           // pre-approved — it's our own tool
  toolManifest: null,           // fetched on first request
  piiFields: null,
  layer0Rules: null,            // covered by global blocklist
  maxOutputBytes: 102400,       // 100KB cap
}
```

The org's existing `ask_` API key is stored as the `org_shared` credential for this connector.

### Admin Approval Workflow

1. Admin POSTs `{ name, proxyUrl, credentialModel, oauthConfig? }` to
   `POST /api/orgs/:id/mcp/server-types`.
2. Backend fetches the tool manifest from `proxyUrl` (GET `/tools` or JSON-RPC
   `tools/list`) and stores it in `toolManifest`.
3. Status is set to `pending_approval`. Admin can review the tool list and `description` fields.
4. Admin POSTs `{ action: "approve" }` to
   `PATCH /api/orgs/:id/mcp/server-types/:serverTypeId`. Sets `status = approved`,
   records `approvedByUserId` and `approvedAt`.
5. If `credentialModel = org_shared`: admin also submits the credential via
   `POST /api/orgs/:id/mcp/server-types/:serverTypeId/credentials`. Gateway encrypts and stores it.
6. If `credentialModel = per_user_*`: each user sees the connector in their Connections panel and
   initiates OAuth or pastes their API key. The gateway stores per-user encrypted credentials.

Status transitions: `pending_approval → approved → suspended`. Suspension immediately blocks all
forwarding for that server type; existing connections are preserved but inactive.

### New Backend Routes

All routes require `requireAuth + requireOrganization`. Approval and credential management
additionally require `requireAdmin`.

```
GET    /api/orgs/:id/mcp/server-types                           list server types for org
POST   /api/orgs/:id/mcp/server-types                           register new server type
GET    /api/orgs/:id/mcp/server-types/:typeId                   get server type + tool manifest
PATCH  /api/orgs/:id/mcp/server-types/:typeId                   approve / suspend
DELETE /api/orgs/:id/mcp/server-types/:typeId                   deregister (soft delete)

POST   /api/orgs/:id/mcp/server-types/:typeId/credentials       store org-shared credential (admin)
DELETE /api/orgs/:id/mcp/server-types/:typeId/credentials       remove org-shared credential (admin)

GET    /api/users/me/mcp/connections                            list my personal connections
POST   /api/users/me/mcp/connections                            connect personal credential
DELETE /api/users/me/mcp/connections/:connectionId              disconnect

GET    /api/orgs/:id/mcp/audit-log                              paginated audit log (admin)
GET    /api/orgs/:id/mcp/audit-log/summary                      aggregate stats by tool/agent/day
```

### Frontend — Phase 1 UI

Two new sections added to the existing org admin panel:

**MCP Servers (admin only)**

- Table of registered server types with status badges (`pending_approval`, `approved`, `suspended`)
- "Add Server" form: name, upstream URL, credential model, OAuth config
- Approval flow: tool manifest viewer → "Approve" / "Suspend" buttons
- Credential input (org-shared model): masked API key field

**My Connections (all members)**

- Cards for each approved server type with `per_user_*` credential model
- "Connect" button → OAuth redirect or API key paste modal
- Connection status: connected / not connected / token expired

A basic **Audit Log** view (admin only) shows the last 1,000 events: agent, tool, server, status,
duration, guard action. Pagination and date filter only. Richer analytics are Phase 2.

## Implementation Plan

### Step 1: Schema + migrations

- Add `credentialModelEnum`, `serverTypeStatusEnum`, `guardActionEnum` to schema
- Add `mcpServerTypes`, `mcpServerConnections`, `mcpAuditLog` tables
- Run `pnpm --filter @agent-in-sync/db-client db:generate`
- Commit migration SQL + `_journal.json` together

### Step 2: Encryption utilities

- Add `packages/mcp-gateway/src/proxy/credential.ts` with `encrypt` / `decrypt`
- Add env var `GATEWAY_ENCRYPTION_KEY` to `.env.example`
- Unit tests: encrypt → decrypt roundtrip; tampered tag throws; wrong key throws

### Step 3: Backend routes + service

- Add `GatewayService` in `packages/backend/src/services/gateway.service.ts`
  - `registerServerType`, `approveServerType`, `suspendServerType`
  - `storeOrgCredential`, `storeUserCredential`
  - `getAuditLog`
- Add routes in `packages/backend/src/routes/gateway.ts`
- Register routes in `server.ts` under `/api`

### Step 4: Data plane proxy

- `packages/mcp-gateway/src/server.ts` — Express app on port 3002
- `packages/mcp-gateway/src/middleware/auth.ts` — call backend `validateApiKey`
- `packages/mcp-gateway/src/middleware/guard.ts` — Layer 0 global blocklist
- `packages/mcp-gateway/src/proxy/router.ts` — orchestrate steps 1–9 from request flow
- `packages/mcp-gateway/src/proxy/forwarder.ts` — HTTP client to upstream
- `packages/mcp-gateway/src/audit/logger.ts` — async audit log writer

### Step 5: AgentInSync connector seed

- Migration or startup script to register the AgentInSync KB connector for all existing orgs
- Store each org's existing API key as the `org_shared` credential

### Step 6: Frontend

- MCP Servers admin section (server type registration, approval, credential input)
- My Connections user section (per-user OAuth / API key)
- Audit Log table (admin)

### Step 7: Tests

- Encryption roundtrip (unit)
- Layer 0 guard: each blocklist pattern blocks correctly (unit)
- Output byte cap: oversized response is truncated (unit)
- Auth rejection: invalid key returns 401 (integration)
- Type not approved: returns 403 (integration)
- No connection: per-user model with no connection returns 403 (integration)
- Successful proxy: request forwarded, response returned, audit row written (integration)
- AgentInSync connector: end-to-end call via gateway to `search_before_fixing` (integration)

## Examples

### Registering a new server type (admin)

```typescript
// POST /api/orgs/:id/mcp/server-types
{
  "name": "GitHub",
  "slug": "github",
  "proxyUrl": "https://api.githubcopilot.com/mcp/",
  "credentialModel": "per_user_oauth",
  "oauthConfig": {
    "clientId": "Ov23li...",
    "authUrl": "https://github.com/login/oauth/authorize",
    "tokenUrl": "https://github.com/login/oauth/access_token",
    "scopes": ["repo", "read:org"]
  }
}

// Response
{
  "id": "uuid",
  "status": "pending_approval",
  "toolManifest": [
    { "name": "create_issue", "description": "Creates a GitHub issue..." },
    { "name": "delete_repository", "description": "Permanently deletes a repository..." }
  ]
}
```

Admin reviews the manifest. Notices `delete_repository`. Adds a Layer 0 rule before approving:

```typescript
// PATCH /api/orgs/:id/mcp/server-types/:typeId
{
  "layer0Rules": [
    { "pattern": "delete_repository", "action": "block", "scope": "tool_name" }
  ]
}
```

Then approves:

```typescript
// PATCH /api/orgs/:id/mcp/server-types/:typeId
{ "action": "approve" }
```

### Agent calling a tool through the gateway

```
POST /gateway/acme-corp/github
X-API-Key: ask_pub_abc123...
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "create_issue",
    "arguments": { "owner": "acme", "repo": "backend", "title": "Fix auth bug" }
  },
  "id": 1
}
```

Gateway: auth → type approved → Layer 0 passes → decrypt OAuth token for this user → forward to
`https://api.githubcopilot.com/mcp/` with `Authorization: Bearer <token>` → return response →
write audit log.

The agent never sees the OAuth token. It only sees the tool result.

### Layer 0 block

```
POST /gateway/acme-corp/internal-db
X-API-Key: ask_pub_abc123...

{ "method": "tools/call", "params": { "name": "query", "arguments": {
  "sql": "DELETE FROM users WHERE 1=1" }}}

→ 403 { "error": "Request blocked by security policy" }
→ audit log: guardLayer="layer0_static", guardAction="blocked"
```

The upstream database server never receives the request.

## Trade-offs

| Pro                                                               | Con                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Single governed entry point — all tool calls audited from day one | Additional network hop adds ~5–20ms latency (TypeScript proxy, local network)             |
| Credentials never in agent context — injected server-side only    | GATEWAY_ENCRYPTION_KEY is a new secret to manage in deployment                            |
| AgentInSync KB is the first connector — immediate working demo    | AgentInSync MCP server must be reachable from gateway process (same host or VPC)          |
| TypeScript data plane — same team, same tooling, faster Phase 1   | Go rewrite (Phase 4) requires re-testing the full request flow                            |
| Layer 0 guard is zero-latency — no inference cost                 | Novel semantic attacks bypass static rules until Phase 3 LLM guard                        |
| Async audit log — never blocks agent response                     | Audit rows could lag or be lost if process crashes before write completes                 |
| Output byte cap prevents economic DoS from day one                | Legitimate tools with large outputs (e.g. document retrieval) need per-type cap tuning    |
| Clear approval workflow — IT sees tool manifest before approval   | Manifest is fetched once at registration; upstream server can change tools without notice |

## Implementation Notes

Key files:

- `packages/db-client/src/schema.ts` — add 3 tables + 3 enums
- `packages/db-client/drizzle/` — generated migration files (do not hand-write)
- `packages/backend/src/services/gateway.service.ts` — new service
- `packages/backend/src/routes/gateway.ts` — new route file
- `packages/backend/src/server.ts` — register `/api` gateway routes
- `packages/mcp-gateway/src/server.ts` — new package, data plane entry point
- `packages/mcp-gateway/src/proxy/credential.ts` — AES-256-GCM encrypt/decrypt
- `packages/mcp-gateway/src/middleware/guard.ts` — Layer 0 blocklists
- `packages/mcp-gateway/src/proxy/router.ts` — request orchestration
- `packages/mcp-gateway/src/audit/logger.ts` — async audit writer
- `packages/frontend/src/routes/_protected/org/mcp/` — admin MCP servers pages
- `packages/frontend/src/routes/_protected/settings/connections.tsx` — user connections page
- `.env.example` — add `GATEWAY_ENCRYPTION_KEY`, `MCP_GATEWAY_PORT`

Environment variables added:

| Variable                 | Description                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| `GATEWAY_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM credential encryption               |
| `MCP_GATEWAY_PORT`       | Data plane port (default 3002)                                      |
| `MCP_SERVER_URL`         | URL of AgentInSync's own MCP server (default http://localhost:3001) |

---

_Created: 2026-05-12_
_Status: Draft_
