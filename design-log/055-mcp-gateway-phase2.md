# Design Log #055: MCP Gateway — Phase 2 (Authorization, PII Masking, Financial Firewall, Observability)

## Background

Phase 1 (Design Log #054) shipped the foundational gateway: server type registry, encrypted
credential storage, the TypeScript data plane proxy, basic Layer 0 static guard, and the immutable
audit log. Agents can now route tool calls through a single governed entry point.

What Phase 1 deliberately deferred:

- **No authorization beyond "type is approved"**: Any authenticated member of the org can call any
  tool on any approved server type. There is no concept of "only admins can run `database:query`."
- **No parameter-level policies**: The Layer 0 blocklist catches known-bad patterns globally, but
  admins cannot define per-tool argument restrictions (e.g. "the `sql` parameter must not contain
  write statements").
- **No PII masking**: The audit log records raw request parameters. A database query result
  containing a `password` column flows unredacted into the audit trail.
- **No financial guardrails**: Output byte caps exist per server type, but there is no per-user
  daily token budget, no cost tracking, and no alert when an agent starts burning money
  unexpectedly.
- **No session-level intelligence**: Rate limiting is temporal (requests/minute). An agent
  progressively escalating its requests across a session — each one just below the block threshold
  — is invisible to Phase 1.
- **No review queue**: Guard blocks are recorded in `mcpAuditLog` but there is no workflow for a
  reviewer to examine them, mark false positives, or feed confirmed attacks back into the ruleset.
- **Audit dashboard is minimal**: Phase 1's UI shows the last 1,000 audit rows with date filter
  only. There is no cost view, no per-agent usage breakdown, and no "scope creep" signal.

This document covers Phase 2: closing all of the above gaps. The LLM semantic guard (Layer 2) and
the open connector SDK remain deferred to Phase 3.

## Problem

1. **Coarse access control**: The Phase 1 model is binary — org member or not. Enterprises need
   to express policies like "junior analysts can search but not write", "database tools require
   admin role", or "email tools are only available to users whose domain matches the org domain."

2. **Parameter-level blind spot**: Even with RBAC in place, a permitted user can still pass
   destructive arguments to an allowed tool. Approving `database:query` does not mean approving
   `DROP TABLE users`.

3. **Raw PII in audit log**: Compliance teams need audit logs, but audit logs containing
   unmasked email addresses, passwords, or health data create a secondary privacy liability. The
   audit log should record _that_ a query ran, not the sensitive data inside it.

4. **Economic exposure is not visible**: Gal Dahan's article documents a $450/hour attack surface
   when output tokens are uncapped. Phase 1 caps bytes per response, but does not track cost, does
   not enforce daily budgets, and does not surface spend in the admin UI. A finance team cannot
   use Phase 1 data to answer "what did our AI tools cost last month?"

5. **Session blindness**: An attacker who knows the static blocklist can craft a sequence of
   requests that each individually pass, while the session as a whole is clearly probing for
   weaknesses. Phase 1 treats every request independently.

6. **No feedback loop for guard rules**: When the gateway blocks something, the event sits in
   `mcpAuditLog`. A reviewer cannot inspect it, mark it a false positive, or extract a pattern to
   add to the permanent blocklist. The guard ruleset is static.

## Questions and Answers

> Q: What is the default authorization policy when no permission rules exist for a tool?

A: **Deny by default** for all server types except the AgentInSync KB connector, which ships
pre-configured with an allow-all rule for `member` role (matching its current behavior). Deny by
default is the correct enterprise security posture — an unanticipated tool should not be callable
just because no one thought to block it. Admins can explicitly set a server type's
`defaultToolPolicy` to `"allow"` for low-risk connectors where blocking by default creates too
much friction. This setting is visible in the UI with a warning label.

> Q: RBAC and ABAC — when do you need both?

A: RBAC (role-based) covers the common case: "only reviewers can call `email:send`." ABAC
(attribute-based) covers the cases RBAC cannot express: "only users whose email domain matches
the org's registered domain can access the Gmail connector" or "only agents with trust level
`verified` can call write tools." The two are not mutually exclusive — a permission rule can
require _both_ a minimum role _and_ an attribute condition. RBAC is the coarse filter; ABAC is
the fine-grained condition layered on top of it.

> Q: What ABAC attributes are available in Phase 2?

A: Attributes resolved at request time from existing data:

| Attribute           | Source                      |
| ------------------- | --------------------------- |
| `user.email_domain` | `users.email`, split on `@` |
| `user.role`         | `organizationMembers.role`  |
| `user.tier`         | `users.tier` (free / paid)  |
| `agent.trust_level` | `apiKeys.trustLevel`        |
| `agent.trust_score` | `apiKeys.trustScore`        |
| `request.tool_name` | JSON-RPC body               |

Phase 3 can extend this list as the connector SDK adds richer context.

> Q: How does parameter-level policy interact with RBAC? Is it a separate step?

A: It is a separate step, evaluated after RBAC/ABAC passes. A user can be _authorized_ to call
a tool but still have their specific _arguments_ rejected by a parameter policy. This separation
is intentional: "can this user call `database:query`?" is an identity question; "is this specific
SQL statement safe?" is a content question. They are evaluated by different logic and produce
different audit records.

> Q: PII masking on the response — does this affect what the agent receives?

A: No. PII masking applies only to what is **stored** in the `mcpAuditLog`. The agent receives
the full, unmasked response. Masking the response before returning it to the agent would break
legitimate use cases (a doctor querying patient records needs the real data). The gateway's role
is to ensure the audit trail does not become a secondary data liability — not to filter data from
authorized users.

> Q: Why add Redis? The existing stack has no Redis dependency.

A: Session anomaly detection requires a sub-millisecond read-write store keyed by session/API key
that resets automatically after inactivity. PostgreSQL can technically do this (polling + TTL
cleanup jobs), but it adds write load to the primary DB on every request and the cleanup logic
is non-trivial. Redis is the correct tool: a `SETEX` + `INCR` pattern for budget counters and
a lightweight list for session score windows. For simpler deployments (on-prem, early
customers), a PostgreSQL fallback with a nightly cleanup job is documented as an alternative,
but the recommended path is Redis. Adding Redis also solves the known in-memory rate limiting
issue flagged in the architecture review (Design Log #009).

> Q: How is token count estimated for cost tracking? MCP responses don't include token metadata.

A: Two approaches, applied in order:

1. If the upstream MCP server returns token usage metadata in the JSON-RPC response (some do,
   following OpenAI conventions), use it directly.
2. Otherwise, estimate: `ceil(responseBytes / 4)` for output tokens,
   `ceil(requestBytes / 4)` for input tokens. This is the standard rough heuristic (1 token ≈
   4 bytes for English text). The estimate is stored with a flag `isTokenEstimate: true` in the
   audit log so dashboards can note the data quality.

> Q: The guardrail evaluation dataset — who owns it and who can edit it?

A: Two tiers. Platform-level datasets ship with the gateway and cover the global blocklist
(SQL injection, shell execution, prompt injection markers). These are read-only to org admins.
Org-level datasets are owned and edited by org admins. When a reviewer marks a guard event as
"confirmed attack" in the review queue, the gateway automatically offers to add it to the org's
evaluation dataset. This closes the feedback loop: real attacks caught in production become
regression tests.

> Q: Streaming responses — Phase 1 deferred this. Is it resolved in Phase 2?

A: Partially. Phase 2 formalizes the `streamingMode` setting on `mcpServerTypes`:

- `buffered` (default): gateway accumulates the full response, runs all guards and PII masking,
  then returns it. Safe but adds latency equal to the full upstream response time.
- `passthrough`: gateway streams the response directly to the agent. Guard and PII masking run
  async after completion, applied to the audit log only (not the streamed response). Allowed only
  for server types the admin explicitly marks as low-risk.
- `chunked`: gateway buffers in 8KB chunks, runs regex-only (Layer 0) guard on each chunk, and
  emits clean chunks. Catches large-pattern injections but misses patterns that span chunk
  boundaries. A middle ground between latency and safety.

Admins set `streamingMode` per server type. The UI shows a warning when `passthrough` or
`chunked` is selected: "Real-time guard scanning is reduced in this mode."

## Design

### A. Authorization: RBAC + ABAC

#### New table: `mcpToolPermissions`

```typescript
export const mcpToolPermissions = pgTable('mcp_tool_permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverTypeId: uuid('server_type_id')
    .notNull()
    .references(() => mcpServerTypes.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  toolName: text('tool_name').notNull(), // specific name or "*" = all tools
  minRole: membershipRoleEnum('min_role').notNull().default('member'),
  isAllowed: boolean('is_allowed').notNull(), // true = allow rule, false = explicit deny
  conditions: jsonb('conditions'), // ABAC attribute conditions (see below)
  parameterPolicy: jsonb('parameter_policy'), // per-argument deny/allow patterns
  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

#### Schema additions to `mcpServerTypes`

```typescript
// Add two columns to existing mcpServerTypes table
defaultToolPolicy: defaultPolicyEnum('default_tool_policy').notNull().default('deny'),
streamingMode:     streamingModeEnum('streaming_mode').notNull().default('buffered'),
```

```typescript
export const defaultPolicyEnum = pgEnum('default_tool_policy', ['allow', 'deny']);
export const streamingModeEnum = pgEnum('streaming_mode', ['buffered', 'chunked', 'passthrough']);
```

#### Permission evaluation algorithm

```typescript
// packages/mcp-gateway/src/middleware/authz.ts

async function evaluatePermission(
  ctx: RequestContext, // { userId, orgId, role, agentTrustLevel, ... }
  serverType: McpServerType,
  toolName: string
): Promise<{ allowed: boolean; reason: string }> {
  // 1. Load all permission rules for this server type + tool, most specific first.
  //    Tool-specific rules (toolName = exact match) take priority over wildcard rules (toolName = "*").
  const rules = await loadPermissionRules(serverType.id, toolName);

  // 2. Explicit DENY — checked first, always wins.
  for (const rule of rules.filter(r => !r.isAllowed)) {
    if (roleAtLeast(ctx.role, rule.minRole) && evaluateAbac(ctx, rule.conditions)) {
      return { allowed: false, reason: `Explicit deny rule (id: ${rule.id})` };
    }
  }

  // 3. Explicit ALLOW — checked next.
  for (const rule of rules.filter(r => r.isAllowed)) {
    if (roleAtLeast(ctx.role, rule.minRole) && evaluateAbac(ctx, rule.conditions)) {
      return { allowed: true, reason: `Allow rule (id: ${rule.id})` };
    }
  }

  // 4. No matching rule — fall back to server type default policy.
  const allowed = serverType.defaultToolPolicy === 'allow';
  return { allowed, reason: `Default policy: ${serverType.defaultToolPolicy}` };
}
```

Role ordering: `member < reviewer < admin`. `roleAtLeast('reviewer', 'member')` is `true`.

#### ABAC condition evaluation

Conditions are a flat object where every key must match (AND semantics). OR conditions require
multiple permission rules.

```typescript
// packages/mcp-gateway/src/middleware/authz.ts

function evaluateAbac(ctx: RequestContext, conditions: Record<string, unknown> | null): boolean {
  if (!conditions) return true; // no conditions = unconditionally apply the role check
  for (const [attribute, expected] of Object.entries(conditions)) {
    const actual = resolveAttribute(ctx, attribute);
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false; // actual must be one of the allowed values
    } else {
      if (actual !== expected) return false;
    }
  }
  return true;
}

function resolveAttribute(ctx: RequestContext, attribute: string): string | null {
  switch (attribute) {
    case 'user.email_domain':
      return ctx.userEmail?.split('@')[1] ?? null;
    case 'user.role':
      return ctx.role;
    case 'user.tier':
      return ctx.userTier;
    case 'agent.trust_level':
      return ctx.agentTrustLevel;
    case 'agent.trust_score':
      return String(ctx.agentTrustScore);
    default:
      return null;
  }
}
```

#### Permission rule examples

```typescript
// Only admins can call any tool on the internal DB connector
{ toolName: '*',            minRole: 'admin',    isAllowed: true,  conditions: null }

// Everyone can call the search tool on SerpAPI
{ toolName: 'search',       minRole: 'member',   isAllowed: true,  conditions: null }

// Explicitly block delete tools for non-admins (even if wildcard allow exists)
{ toolName: 'delete_repo',  minRole: 'member',   isAllowed: false, conditions: null }

// Gmail connector — only users whose email is on the company domain
{ toolName: '*', minRole: 'member', isAllowed: true,
  conditions: { 'user.email_domain': 'company.com' } }

// Write tools require verified trust level
{ toolName: 'push_commit', minRole: 'member', isAllowed: true,
  conditions: { 'agent.trust_level': ['trusted', 'verified'] } }
```

### B. Parameter-Level Policies

The `parameterPolicy` field on `mcpToolPermissions` defines per-argument restrictions applied
after RBAC/ABAC passes.

#### Format

```typescript
// parameterPolicy JSONB structure
{
  "<argument_name>": {
    "denyPattern":  string | null,  // regex — if argument matches, block
    "allowPattern": string | null,  // regex — if argument does NOT match, block
    "maxLength":    number | null   // block if argument string exceeds N characters
  }
}
```

#### Evaluation

```typescript
// packages/mcp-gateway/src/middleware/paramPolicy.ts

function evaluateParameterPolicy(
  toolArgs: Record<string, unknown>,
  policy: ParameterPolicy
): { blocked: boolean; reason: string } | null {
  for (const [param, rules] of Object.entries(policy)) {
    const value = String(toolArgs[param] ?? '');
    if (rules.denyPattern && new RegExp(rules.denyPattern, 'i').test(value)) {
      return { blocked: true, reason: `Parameter "${param}" matches deny pattern` };
    }
    if (rules.allowPattern && !new RegExp(rules.allowPattern, 'i').test(value)) {
      return { blocked: true, reason: `Parameter "${param}" does not match allow pattern` };
    }
    if (rules.maxLength && value.length > rules.maxLength) {
      return { blocked: true, reason: `Parameter "${param}" exceeds max length` };
    }
  }
  return null;
}
```

#### Example policies

```typescript
// Database query tool — block write statements, cap query size
{
  toolName: 'database:query',
  parameterPolicy: {
    "sql": {
      "denyPattern": "\\b(DROP|DELETE|TRUNCATE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\\b",
      "allowPattern": null,
      "maxLength": 4000
    }
  }
}

// Email send tool — only send to company domain addresses
{
  toolName: 'gmail:send_email',
  parameterPolicy: {
    "to": { "denyPattern": null, "allowPattern": "@company\\.com$", "maxLength": null }
  }
}
```

### C. PII Masking

Applied to request parameters before storing in `mcpAuditLog`. The agent receives the unmasked
response; only the audit record is sanitized.

#### Two masking layers

**Layer A — Admin-declared** (zero false positives):
`mcpServerTypes.piiFields` maps tool names to parameter and response field paths that are always
masked, regardless of their content:

```json
{
  "database:query": ["sql"],
  "gmail:send_email": ["body", "subject"],
  "github:create_issue": ["body"]
}
```

Matching fields are replaced with `"[REDACTED:declared]"` before the audit row is written.

**Layer B — Pattern-detected** (catches undeclared PII):
Applied to all remaining string values after Layer A. Uses the following patterns:

```typescript
// packages/mcp-gateway/src/audit/pii.ts

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'email', pattern: /[\w.+\-]+@[\w\-]+\.[\w.]+/ },
  { type: 'phone', pattern: /(\+?\d[\d\s\-().]{7,}\d)/ },
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: 'credit_card', pattern: /\b(?:\d[ \-]?){13,16}\b/ },
  { type: 'ssh_key', pattern: /-----BEGIN\s+(?:RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/ },
  { type: 'bearer_token', pattern: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/ },
];

export function maskPii(obj: unknown): { masked: unknown; detected: PiiDetection[] } {
  // Recursively walk JSON, replace matched string values, collect detection records
}
```

The `detected` list records field paths and PII types for the `piiMasked` column.

#### Schema additions to `mcpAuditLog`

```typescript
// New columns added to existing mcpAuditLog table (migration required)
piiMasked:            jsonb('pii_masked'),     // [{ path: "params.sql", type: "declared" }]
inputTokens:          integer('input_tokens'),
outputTokens:         integer('output_tokens'),
isTokenEstimate:      boolean('is_token_estimate').notNull().default(true),
estimatedCostUsd:     doublePrecision('estimated_cost_usd'),
```

#### Cost estimation

```typescript
// packages/mcp-gateway/src/audit/cost.ts

// Rates approximate GPT-4o pricing; configurable per org in mcpGuardProfiles
const DEFAULT_INPUT_RATE_PER_TOKEN = 0.0000025; // $2.50 / 1M tokens
const DEFAULT_OUTPUT_RATE_PER_TOKEN = 0.00001; // $10.00 / 1M tokens

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * DEFAULT_INPUT_RATE_PER_TOKEN + outputTokens * DEFAULT_OUTPUT_RATE_PER_TOKEN;
}
```

Cost rates are configurable per org in `mcpGuardProfiles.costConfig` JSONB so enterprises can
use their actual contracted rates.

### D. Guard Profiles + Financial Firewall

#### New table: `mcpGuardProfiles`

One profile per (org, server type, environment) combination. The data plane loads the matching
profile on every request. Null `serverTypeId` = org-wide default.

```typescript
export const mcpGuardProfiles = pgTable('mcp_guard_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  serverTypeId: uuid('server_type_id').references(() => mcpServerTypes.id), // null = org default
  environment: environmentEnum('environment').notNull().default('production'),

  // Financial firewall
  maxOutputTokensPerCall: integer('max_output_tokens_per_call'), // null = use byte cap only
  dailyTokenBudgetPerUser: integer('daily_token_budget_per_user'), // null = no budget
  dailyTokenBudgetPerOrg: integer('daily_token_budget_per_org'), // null = no budget
  costConfig: jsonb('cost_config'), // { inputRatePerToken, outputRatePerToken }

  // Layer 0 extended
  responseBlocklist: jsonb('response_blocklist'), // additional response-side regex rules

  // Layer 1 structural
  outboundDomainAllowlist: jsonb('outbound_domain_allowlist'), // ["*.company.com", "api.github.com"]
  maxRequestSizeBytes: integer('max_request_size_bytes'),

  // Streaming
  // (streamingMode is set per server type, not per profile)

  // Review queue
  reviewQueueEnabled: boolean('review_queue_enabled').notNull().default(true),
  autoBlockOnStrike: integer('auto_block_on_strike').default(3), // N-strike threshold

  createdByUserId: uuid('created_by_user_id')
    .notNull()
    .references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

The `environmentEnum` reuses the existing `environments` enum from the schema
(`development | staging | production | ci`).

#### Daily budget enforcement via Redis

```typescript
// packages/mcp-gateway/src/middleware/budget.ts

// Keys
// User budget:  budget:user:{orgId}:{userId}:{YYYY-MM-DD}
// Org budget:   budget:org:{orgId}:{YYYY-MM-DD}
// Both use INCR + EXPIREAT (end of UTC day)

async function checkAndIncrementBudget(
  redis: RedisClient,
  profile: McpGuardProfile,
  ctx: RequestContext,
  estimatedOutputTokens: number // estimated BEFORE the call using prompt length heuristic
): Promise<{ allowed: boolean; reason?: string }> {
  if (profile.dailyTokenBudgetPerUser) {
    const key = `budget:user:${ctx.orgId}:${ctx.userId}:${utcDateString()}`;
    const current = await redis.incrby(key, estimatedOutputTokens);
    if (current === estimatedOutputTokens) await redis.expireat(key, endOfUtcDay());
    if (current > profile.dailyTokenBudgetPerUser) {
      return { allowed: false, reason: 'Daily user token budget exceeded' };
    }
  }
  if (profile.dailyTokenBudgetPerOrg) {
    const key = `budget:org:${ctx.orgId}:${utcDateString()}`;
    const current = await redis.incrby(key, estimatedOutputTokens);
    if (current === estimatedOutputTokens) await redis.expireat(key, endOfUtcDay());
    if (current > profile.dailyTokenBudgetPerOrg) {
      return { allowed: false, reason: 'Daily org token budget exceeded' };
    }
  }
  return { allowed: true };
}
```

Budget is checked with a pre-call estimate (based on request size) and reconciled post-call
with the actual output token count. If the actual count exceeds the estimate, the overage is
counted against the _next_ request's budget check. This prevents exact enforcement but avoids
blocking legitimate requests based on a guess.

### E. Session Anomaly Detection

#### Session context in Redis

```typescript
// Key: session:{apiKeyId}   TTL: 30 minutes, refreshed on each request
// Value: JSON { scores: number[], totalOutputTokens: number, requestCount: number,
//               firstRequestAt: string, lastRequestAt: string }

// scores: rolling window of the last 10 guard scores (0 = clean, 1 = maximum suspicion)
// A "guard score" is assigned by the static rule engine:
//   0.0 = no rules triggered
//   0.3 = one Layer 0 rule triggered but blocked (flagged, not hard-blocked)
//   0.6 = parameter policy near-miss (argument matched allow pattern but barely)
//   1.0 = hard block
```

#### Anomaly triggers

```typescript
// packages/mcp-gateway/src/middleware/sessionAnomaly.ts

function detectAnomaly(session: SessionContext, profile: McpGuardProfile): AnomalyResult | null {
  // N-strike: last N scores all above suspicion threshold
  const recentScores = session.scores.slice(-3);
  if (recentScores.length === 3 && recentScores.every(s => s >= 0.3)) {
    return {
      type: 'escalating_suspicion',
      severity: 'medium',
      action: session.scores.slice(-3).every(s => s >= 0.6) ? 'block' : 'flag',
    };
  }

  // Token spike: current session tokens > 3× the org's rolling session average
  // (org average stored in Redis, updated async after each session closes)
  if (session.totalOutputTokens > session.orgSessionAverage * 3) {
    return { type: 'token_spike', severity: 'high', action: 'flag' };
  }

  return null;
}
```

Anomaly actions:

- `flag`: request proceeds but written to review queue with elevated priority
- `block`: request rejected with 429, written to review queue

### F. Guard Events + Review Queue

#### New table: `mcpGuardEvents`

```typescript
export const mcpGuardEvents = pgTable('mcp_guard_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditLogId: uuid('audit_log_id')
    .notNull()
    .references(() => mcpAuditLog.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  triggerLayer: guardLayerEnum('trigger_layer').notNull(),
  direction: guardDirectionEnum('direction').notNull(), // "request" | "response"
  severity: severityEnum('severity').notNull(),
  detectedPattern: text('detected_pattern'), // the regex that matched, or rule description
  guardScore: doublePrecision('guard_score'), // 0.0-1.0; null for deterministic blocks
  action: guardActionEnum('guard_action').notNull(),

  // Review workflow
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewOutcome: reviewOutcomeEnum('review_outcome'), // null until reviewed
  addedToDataset: boolean('added_to_dataset').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const guardLayerEnum = pgEnum('guard_layer', [
  'layer0_global', // global platform blocklist
  'layer0_org', // org-defined regex rules
  'layer0_response', // response-side injection scan
  'layer1_size', // output byte/token cap
  'layer1_budget', // daily budget exceeded
  'layer1_domain', // outbound domain not in allowlist
  'layer1_session', // session anomaly detection
  'param_policy', // parameter-level policy
  'authz_rbac', // RBAC check (role insufficient)
  'authz_abac', // ABAC check (condition not met)
]);

export const guardDirectionEnum = pgEnum('guard_direction', ['request', 'response']);

export const reviewOutcomeEnum = pgEnum('review_outcome', [
  'confirmed_attack',
  'false_positive',
  'inconclusive',
  'escalated',
]);
```

The `severityEnum` reuses the existing `severity` enum from the schema (`low | medium | high | critical`).

#### Review queue workflow

1. A guard event is written whenever `guardAction ≠ 'passed'`.
2. Reviewers see a queue in the admin UI filtered by: unreviewed, severity, server type, date.
3. Each queue item shows: full request params (PII-masked), matched pattern, agent identity, session history for this API key.
4. Reviewer actions:
   - **Confirm attack** → `reviewOutcome = confirmed_attack`. Optionally: "Add this pattern to org blocklist" (one click), "Add to evaluation dataset".
   - **Mark false positive** → `reviewOutcome = false_positive`. Optionally: "Increase threshold for this pattern" or "Remove rule".
   - **Escalate** → `reviewOutcome = escalated`. Notifies org admin via email (uses existing notification infrastructure).
5. False positive rate per rule is tracked and surfaced in the guard rules admin view as a quality signal.

### G. Guardrail Evaluation Datasets

Closes the feedback loop: real incidents become regression tests.

#### New tables

```typescript
export const mcpGuardDatasets = pgTable('mcp_guard_datasets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id), // null = platform
  serverTypeId: uuid('server_type_id').references(() => mcpServerTypes.id), // null = any
  name: text('name').notNull(),
  description: text('description'),
  isReadOnly: boolean('is_read_only').notNull().default(false), // platform datasets
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mcpGuardDatasetItems = pgTable('mcp_guard_dataset_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  datasetId: uuid('dataset_id')
    .notNull()
    .references(() => mcpGuardDatasets.id),
  toolName: text('tool_name').notNull(),
  requestParams: jsonb('request_params').notNull(), // the arguments to test
  responseText: text('response_text'), // for response-side tests
  expectedAction: expectedActionEnum('expected_action').notNull(), // "pass" | "block"
  notes: text('notes'),
  sourceEventId: uuid('source_event_id').references(() => mcpGuardEvents.id), // if from review queue
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expectedActionEnum = pgEnum('expected_action', ['pass', 'block']);
```

#### Evaluation endpoint

```
POST /api/orgs/:id/mcp/guard/evaluate
Body: { datasetId: "uuid", serverTypeId?: "uuid" }
Response: {
  total: 42,
  passed: 40,
  failed: 2,  // wrong outcome predicted
  accuracy: 0.952,
  failures: [{ itemId, toolName, expectedAction, actualAction, triggeredBy }]
}
```

Admins can run this on demand or schedule it after any guard configuration change.

### H. Updated Request Flow (full Phase 2)

```
POST /gateway/:orgSlug/:serverTypeSlug
     │
  1. Auth
     X-API-Key → validateApiKey() → { userId, orgId, role, apiKeyId, agentId,
                                       agentTrustLevel, agentTrustScore, userEmail, userTier }
     → 401 if invalid
     │
  2. Type resolution + status check
     → 404 if not found; 403 if status ≠ "approved"
     │
  2b. Load guard profile (org + serverType + environment match)
     │
  3. RBAC check
     evaluatePermission(ctx, serverType, toolName)
     → 403 + guard event (authz_rbac) if denied
     │
  4. ABAC check (within permission evaluation, see §A)
     → 403 + guard event (authz_abac) if conditions not met
     │
  5. Parameter policy check
     evaluateParameterPolicy(toolArgs, matchedRule.parameterPolicy)
     → 403 + guard event (param_policy) if blocked
     │
  6. Layer 0 guard — request side
     Global blocklist + org-defined Layer 0 rules on params
     → 403 + guard event (layer0_*) if blocked
     │
  7. Layer 1 — outbound domain check
     If any URL in params not in outboundDomainAllowlist
     → 403 + guard event (layer1_domain) if blocked
     │
  8. Layer 1 — daily budget pre-check
     Estimate output tokens from request size; check Redis budget counters
     → 429 + guard event (layer1_budget) if exceeded
     │
  9. Session anomaly check
     Load session context from Redis; run detectAnomaly()
     → 429 + guard event (layer1_session) if action = "block"
     → continue (flagged) if action = "flag"
     │
 10. Credential resolution + decryption
     → 403 "No active connection" if missing
     │
 11. Forward to upstream (with streaming mode awareness)
     Record start time; HTTP POST to proxyUrl; capture status + body/stream + duration
     │
 12. Layer 1 — output size/token cap enforcement
     Byte cap: truncate if response > maxOutputBytes (guardAction = "truncated")
     Token cap: estimate output tokens; if > maxOutputTokensPerCall → truncate
     → guard event (layer1_size) if truncated
     │
 13. Layer 0 guard — response side
     Global response blocklist (injection markers) + profile.responseBlocklist
     → 502 + guard event (layer0_response) if blocked
     → strip injected segment + flag if action = "flag"
     │
 14. PII masking
     Layer A: declared fields from piiFields
     Layer B: pattern detection on remaining strings
     Build piiMasked detection list
     │
 15. Async writes (never block response)
     a. INSERT mcpAuditLog (with masked params, token counts, cost estimate, piiMasked)
     b. INSERT mcpGuardEvents for any triggered layers
     c. UPDATE mcpServerConnections.lastUsedAt
     d. INCR Redis session context scores + token count
     e. INCR Redis budget counters with actual output tokens (reconcile with pre-check estimate)
     │
 16. Return response to agent
```

### I. New Backend Routes (Phase 2 additions)

```
# Permission management (admin)
GET    /api/orgs/:id/mcp/server-types/:typeId/permissions    list permission rules
POST   /api/orgs/:id/mcp/server-types/:typeId/permissions    create rule
PUT    /api/orgs/:id/mcp/server-types/:typeId/permissions/:ruleId  update rule
DELETE /api/orgs/:id/mcp/server-types/:typeId/permissions/:ruleId  delete rule

# Guard profiles (admin)
GET    /api/orgs/:id/mcp/guard/profiles                      list guard profiles
POST   /api/orgs/:id/mcp/guard/profiles                      create profile
PUT    /api/orgs/:id/mcp/guard/profiles/:profileId           update profile

# Review queue (reviewer + admin)
GET    /api/orgs/:id/mcp/guard/events                        paginated guard events
PATCH  /api/orgs/:id/mcp/guard/events/:eventId               review an event

# Guardrail evaluation (admin)
GET    /api/orgs/:id/mcp/guard/datasets                      list datasets
POST   /api/orgs/:id/mcp/guard/datasets                      create dataset
POST   /api/orgs/:id/mcp/guard/datasets/:datasetId/items     add test item
POST   /api/orgs/:id/mcp/guard/evaluate                      run evaluation

# Analytics (admin)
GET    /api/orgs/:id/mcp/analytics/cost                      cost by agent/tool/day
GET    /api/orgs/:id/mcp/analytics/scope-creep               token usage vs. expected baselines
GET    /api/orgs/:id/mcp/analytics/guard-effectiveness       block rate, false positive rate per rule
```

### J. Frontend Additions

**Permission Rules editor** (admin, per server type):

- Table of permission rules with role, tool pattern, ABAC conditions, allow/deny badge
- Add/edit rule modal with condition builder (attribute + value dropdowns, not raw JSON)
- Parameter policy editor per tool: argument name, deny pattern, allow pattern, max length

**Guard Profile editor** (admin):

- Financial firewall: output token cap per call, daily budget per user, daily budget per org
- Token cost rates (for cost estimation)
- Response blocklist (custom patterns beyond the global list)
- Outbound domain allowlist
- N-strike threshold

**Review Queue** (reviewer + admin):

- List of unreviewed guard events, sortable by severity and date
- Event detail: full request (PII-masked params), pattern that triggered, agent session timeline
- Action buttons: Confirm Attack / False Positive / Escalate + optional "Add to dataset"

**Audit Analytics dashboard** (admin):

- Cost over time (line chart, by tool and by agent)
- Scope Creep view: tools ranked by output tokens vs. expected baseline
- Guard effectiveness: block rate per layer, false positive rate per rule, events trend
- Budget utilization: per-user and org-level daily budget consumption bars

## Implementation Plan

### Step 1: Schema + migrations

- Add `mcpToolPermissions`, `mcpGuardProfiles`, `mcpGuardEvents`,
  `mcpGuardDatasets`, `mcpGuardDatasetItems` tables
- Add new enums: `defaultPolicyEnum`, `streamingModeEnum`, `guardLayerEnum`,
  `guardDirectionEnum`, `reviewOutcomeEnum`, `expectedActionEnum`
- Add columns to existing `mcpServerTypes`: `defaultToolPolicy`, `streamingMode`
- Add columns to existing `mcpAuditLog`: `piiMasked`, `inputTokens`, `outputTokens`,
  `isTokenEstimate`, `estimatedCostUsd`
- Run `pnpm --filter @agent-in-sync/db-client db:generate`; commit SQL + journal

### Step 2: Redis client

- Add `ioredis` dependency to `packages/mcp-gateway`
- Add `REDIS_URL` to `.env.example`
- Add `docker-compose` entry for Redis (development)
- Singleton Redis client pattern matching existing `getDb()` pattern in db-client

### Step 3: Authorization middleware

- `packages/mcp-gateway/src/middleware/authz.ts` — RBAC + ABAC evaluation
- `packages/mcp-gateway/src/middleware/paramPolicy.ts` — parameter policy evaluation
- Unit tests: deny wins over allow, ABAC AND semantics, wildcard vs specific rule priority,
  default policy fallback

### Step 4: PII masking

- `packages/mcp-gateway/src/audit/pii.ts` — declared + pattern masking, recursive JSON walker
- Unit tests: each PII pattern type, declared-field masking, nested object masking, no false
  positives on common non-PII strings

### Step 5: Financial firewall + session anomaly

- `packages/mcp-gateway/src/middleware/budget.ts` — Redis budget counters
- `packages/mcp-gateway/src/middleware/sessionAnomaly.ts` — session context + anomaly detection
- Unit tests: budget check blocks at threshold, overage reconciliation, N-strike trigger,
  token spike detection

### Step 6: Guard profiles + events

- `packages/backend/src/services/guardProfile.service.ts` — CRUD for profiles
- Update `packages/mcp-gateway/src/middleware/guard.ts` — load profile per request,
  apply response blocklist and domain allowlist
- Update `packages/mcp-gateway/src/audit/logger.ts` — write `mcpGuardEvents` rows
- Update `packages/mcp-gateway/src/proxy/router.ts` — integrate all new middleware
  into the 16-step request flow

### Step 7: Guardrail evaluation engine

- `packages/mcp-gateway/src/guard/evaluator.ts` — runs dataset items against current config
- Backend endpoint: `POST /api/orgs/:id/mcp/guard/evaluate`
- Seed platform dataset with known SQL injection, shell execution, prompt injection examples

### Step 8: Streaming mode

- Update `packages/mcp-gateway/src/proxy/forwarder.ts` — support buffered / chunked / passthrough
- PII masking in chunked mode: apply only Layer A (declared fields) per chunk; Layer B runs on
  the completed buffer written to the audit log

### Step 9: Backend routes

- Add permission, guard profile, review queue, evaluation, and analytics routes
- Analytics queries use Drizzle aggregate + GROUP BY on `mcpAuditLog` and `mcpGuardEvents`

### Step 10: Frontend

- Permission rules editor
- Guard profile editor
- Review queue
- Audit analytics dashboard

### Step 11: Tests

- RBAC: member blocked from admin-only tool (integration)
- ABAC: wrong email domain blocked (integration)
- Parameter policy: SQL write statement blocked (integration)
- PII masking: password field redacted in audit row; agent receives original (integration)
- Budget: request blocked after daily limit reached (integration)
- Session N-strike: third suspicious request in session is blocked (integration)
- Review queue: confirm attack → pattern added to blocklist (integration)
- Evaluation dataset: known injection payload scores 100% block rate (integration)

## Examples

### RBAC block

```
Agent (member role) calls database:query on the internal DB connector.
Permission rule: { toolName: "database:query", minRole: "admin", isAllowed: true }
No allow rule matches member role. Default policy: "deny".

→ 403 { "error": "Access denied", "detail": "Insufficient role for this tool" }
→ mcpGuardEvents: { triggerLayer: "authz_rbac", severity: "low", action: "blocked" }
```

### ABAC block

```
Agent (reviewer role, email: contractor@external.com) calls gmail:send_email.
Permission rule: { toolName: "*", minRole: "member", isAllowed: true,
                   conditions: { "user.email_domain": "company.com" } }
Attribute check: "external.com" ≠ "company.com" → condition fails.
No other allow rule. Default policy: "deny".

→ 403 { "error": "Access conditions not met" }
→ mcpGuardEvents: { triggerLayer: "authz_abac", severity: "low", action: "blocked" }
```

### Parameter policy block

```
Agent (admin role) calls database:query — RBAC passes.
Tool args: { "sql": "DELETE FROM users WHERE active = false" }
Parameter policy denyPattern: "\\b(DELETE|DROP|TRUNCATE)\\b"
Match found in "sql" argument.

→ 403 { "error": "Parameter policy violation", "detail": "Parameter \"sql\" matches deny pattern" }
→ mcpGuardEvents: { triggerLayer: "param_policy", severity: "high", action: "blocked",
                    detectedPattern: "\\b(DELETE|DROP|TRUNCATE)\\b" }
```

### PII masking in audit log

```
Agent calls database:query → result contains column named "password".
piiFields declared: { "database:query": ["sql"] }   (only "sql" is declared)
Pattern detection finds: result.rows[2].password = "hunter2" (bearer_token pattern)

Audit log stores:
  requestParams: { "sql": "[REDACTED:declared]" }
  piiMasked: [
    { "path": "params.sql",              "type": "declared" },
    { "path": "response.rows.2.password","type": "bearer_token" }
  ]

Agent receives the real response including the password value (authorized to see it).
```

### Daily budget enforcement

```
User has dailyTokenBudgetPerUser = 50,000 tokens.
Current Redis counter: 49,800 tokens consumed today.
Incoming request estimated output: 800 tokens.
49,800 + 800 = 50,600 > 50,000.

→ 429 { "error": "Daily token budget exceeded. Resets at 00:00 UTC." }
→ mcpGuardEvents: { triggerLayer: "layer1_budget", severity: "medium", action: "blocked" }
```

## Trade-offs

| Pro                                                               | Con                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Deny-by-default eliminates "forgotten permission" vulnerabilities | Requires admins to configure allow rules before any tool is usable (onboarding friction) |
| ABAC conditions catch identity-based attacks RBAC cannot          | Condition evaluation adds ~1ms DB read per request (mitigated by profile caching)        |
| PII masking protects audit log without hiding data from agents    | Pattern detection has false positives (phone-number-like strings in non-PII context)     |
| Redis budget enforcement is sub-millisecond                       | Redis is a new operational dependency; on-prem customers must run it                     |
| Session anomaly catches progressive boundary-testing              | Session context adds 2× Redis round-trips per request (1 read + 1 write)                 |
| Review queue creates a human feedback loop                        | Reviewers must be trained; without active review the queue becomes a backlog             |
| Guardrail evaluation datasets prevent regression                  | Dataset must be maintained as connectors and rulesets evolve                             |
| Cost tracking turns security into a finance conversation          | Cost estimates are approximations (±20%) without real token metadata from upstreams      |
| Streaming modes let admins trade safety for latency               | `passthrough` mode bypasses PII masking on the response path entirely                    |

## Implementation Notes

Key new files:

- `packages/mcp-gateway/src/middleware/authz.ts` — RBAC + ABAC
- `packages/mcp-gateway/src/middleware/paramPolicy.ts` — parameter policies
- `packages/mcp-gateway/src/middleware/budget.ts` — Redis budget counters
- `packages/mcp-gateway/src/middleware/sessionAnomaly.ts` — session context
- `packages/mcp-gateway/src/audit/pii.ts` — PII masking (declared + pattern)
- `packages/mcp-gateway/src/audit/cost.ts` — token estimation + cost calculation
- `packages/mcp-gateway/src/guard/evaluator.ts` — dataset-driven evaluation
- `packages/backend/src/services/guardProfile.service.ts` — guard profile CRUD
- `packages/backend/src/services/permission.service.ts` — tool permission CRUD
- `packages/backend/src/routes/permissions.ts` — permission management routes
- `packages/backend/src/routes/guardProfiles.ts` — guard profile routes
- `packages/backend/src/routes/reviewQueue.ts` — review queue routes
- `packages/backend/src/routes/analytics.ts` — cost and effectiveness analytics

New environment variables:

| Variable                 | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `REDIS_URL`              | Redis connection string (default `redis://localhost:6379`) |
| `SESSION_ANOMALY_WINDOW` | Number of requests in rolling score window (default `10`)  |
| `SESSION_TTL_SECONDS`    | Session context TTL in Redis (default `1800` = 30 min)     |

Infrastructure additions:

- `docker-compose.yml` — add `redis:7-alpine` service for development
- Deployment: Redis 7.x required alongside PostgreSQL

---

_Created: 2026-05-12_
_Status: Draft_
