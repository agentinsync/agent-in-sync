# Design Log #064: MCP Gateway — Addendum (Cross-Phase Gaps)

## Background

After reviewing Design Logs #054–057, seven topics were discussed during product planning but
never fully designed in any phase log. This addendum documents each gap, specifies which phase
it amends, and provides the full design. No new phases are introduced — these are corrections
and additions to existing phases.

**Gaps covered:**

1. OAuth credential refresh lifecycle _(amends Phase 1 + Phase 3)_
2. User-level granular tool subscription _(amends Phase 2)_
3. "Suggest a connector" request workflow _(amends Phase 3)_
4. Alert and notification system _(amends Phase 2)_
5. `mcp:read` vs `mcp:write` action enforcement _(amends Phase 2)_
6. Audit log retention policy _(amends Phase 4)_
7. Connector version management _(amends Phase 3)_

---

## Gap 1: OAuth Credential Refresh Lifecycle

**Amends:** Phase 1 (schema), Phase 3 (connector SDK)

### Problem

Phase 1 stores `encryptedRefresh` and `tokenExpiresAt` on `mcpServerConnections`. Phase 3's
connector SDK defines an optional `refreshCredential?` method. Neither phase designed _when_
or _how_ the refresh is triggered. Most OAuth providers (GitHub, Slack, Google) issue access
tokens that expire in 1 hour. Without a refresh mechanism, per-user OAuth connections
silently fail on the first request after expiry — the agent receives a cryptic upstream 401
and the user has no idea why.

### Design

Two complementary trigger points:

**Trigger A — Background scheduler (proactive):**
A background job runs every 15 minutes. It scans `mcpServerConnections` for rows where
`credentialType = 'oauth_token'` AND `tokenExpiresAt < now() + 30min` AND `isActive = true`.
For each expiring connection, it:

1. Calls the connector's `refreshCredential()` (via connector SDK or standard OAuth refresh
   grant if connector doesn't implement it).
2. On success: re-encrypts the new access token, updates `encryptedSecret`, `tokenExpiresAt`,
   and `encryptedRefresh` (if a new refresh token was issued). Sets `refreshStatus = 'ok'`.
3. On failure: sets `refreshStatus = 'refresh_failed'`, `refreshFailedAt`, `refreshFailedReason`.
   Triggers an alert (Gap 4) to the user. Does not deactivate the connection — it may still
   work with the current token until it fully expires.

**Trigger B — On-demand (request time fallback):**
In the credential fetch step of the gateway request flow (step 10 in Phase 2), before
injecting the credential, the gateway checks `tokenExpiresAt`. If expired:

1. Attempt refresh inline (adds ~200ms latency but avoids a failed upstream call).
2. If refresh succeeds, proceed with new token and update DB async.
3. If refresh fails and `refreshStatus = 'refresh_failed'`: return 403
   `"Connection expired — user must reconnect"` and write audit log.

**Standard OAuth refresh grant (fallback when connector has no `refreshCredential`):**

```typescript
// packages/mcp-gateway/src/proxy/credential.ts  (TypeScript) or
// packages/mcp-gateway-go/internal/proxy/credential.go  (Go, Phase 4+)

async function standardOAuthRefresh(
  connection: McpServerConnection,
  serverType: McpServerType
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
  const refreshToken = decrypt(connection.encryptedRefresh!);
  const { tokenUrl } = serverType.oauthConfig!;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: serverType.oauthConfig!.clientId,
      client_secret: process.env[`OAUTH_CLIENT_SECRET_${serverType.slug.toUpperCase()}`]!,
    }),
  });

  if (!response.ok) throw new Error(`Refresh failed: ${response.status}`);
  const json = await response.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token, // not all providers rotate refresh tokens
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}
```

OAuth client secrets are stored as environment variables per connector slug, not in the
database. This keeps them out of the credential encryption surface.

### Schema additions to `mcpServerConnections`

```typescript
refreshStatus:       refreshStatusEnum('refresh_status').notNull().default('ok'),
refreshFailedAt:     timestamp('refresh_failed_at', { withTimezone: true }),
refreshFailedReason: text('refresh_failed_reason'),
```

```typescript
export const refreshStatusEnum = pgEnum('refresh_status', [
  'ok',
  'refresh_failed', // last refresh attempt failed
  'no_refresh_token', // provider didn't issue a refresh token
]);
```

### New user-facing endpoint

```
POST /api/users/me/mcp/connections/:connectionId/reconnect
```

Redirects the user through the OAuth flow again, replacing the existing connection's tokens.
This is the recovery path when `refreshStatus = 'refresh_failed'`.

### Connector SDK update

The optional `refreshCredential?` method in `MCPConnector` is invoked by the gateway's
refresh logic before falling back to the standard OAuth grant. If the connector implements it,
the connector owns the refresh logic (useful for providers with non-standard refresh flows
like Slack's token rotation model).

---

## Gap 2: User-Level Granular Tool Subscription

**Amends:** Phase 2 (authorization)

### Problem

The team's blueprint explicitly specifies: _"Users don't just 'enable GitHub'; they select
specific tools (e.g., `read_issue` enabled, `delete_repo` disabled) to minimize their personal
risk footprint."_ Phase 2's RBAC/ABAC model is admin-set and role-based. There is no
mechanism for individual users to opt out of specific tools that the admin permits. A member
who never wants their agent to send emails should be able to disable `gmail:send_email` for
themselves without asking an admin.

### Design

This is an **opt-out model**: admin permits tool X for a role → user can disable tool X for
their own agent sessions. Users cannot opt _in_ to tools the admin has blocked.

#### New table: `userToolPreferences`

```typescript
export const userToolPreferences = pgTable('user_tool_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  serverTypeId: uuid('server_type_id')
    .notNull()
    .references(() => mcpServerTypes.id),
  toolName: text('tool_name').notNull(), // specific name or "*" = all tools on this server
  isEnabled: boolean('is_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Default state: no rows = all tools enabled (backward compatible with existing behavior).
A row with `isEnabled = false` disables that tool for the user's agent sessions.

#### Authorization step update (Phase 2 step 3)

After RBAC/ABAC passes, add:

```typescript
// Step 3b: User tool preference check
const pref = await getUserToolPreference(ctx.userId, serverType.id, toolName);
if (pref && !pref.isEnabled) {
  return { allowed: false, reason: 'Tool disabled by user preference' };
}
```

This step never overrides an admin DENY — it only applies when RBAC/ABAC would have allowed
the call. Guard event written with `triggerLayer: 'user_preference'`, `severity: 'low'`.

#### `tools/list` filtering

When building the tool manifest for a user's session, tools with `isEnabled = false` are
excluded. The user's agent never sees these tools in its context — they are invisible, not
just blocked at execution time. This is important for token economics: a user who disables 30
tools saves those tool definitions from every context window.

#### New routes

```
GET    /api/users/me/mcp/tool-preferences              list my preferences (all server types)
PUT    /api/users/me/mcp/tool-preferences/:serverTypeId  set preferences for one server type
```

`PUT` accepts an array of `{ toolName, isEnabled }` objects. An empty array resets to default
(all enabled).

#### Frontend

A "Tool Preferences" section under each connected server type in the "My Connections" panel.
Shows a toggle list of all tools the admin has permitted for the user's role. Disabled tools
are clearly marked as "excluded from your agent's context."

---

## Gap 3: "Suggest a Connector" Request Workflow

**Amends:** Phase 3 (connector registry)

### Problem

Phase 3 designs the Connector Marketplace as an admin-install flow. The team's blueprint
describes a bottom-up flow: _"Users can 'Suggest' new MCP servers. The system automatically
fetches the server's manifest and presents it to IT for one-click vetting."_ Without this,
users who need a tool that isn't in the marketplace must go through email or a ticket system
— breaking the self-service narrative of the Agentic App Store.

### Design

#### New table: `connectorSuggestions`

```typescript
export const connectorSuggestions = pgTable('connector_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  suggestedByUserId: uuid('suggested_by_user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(), // "Notion MCP"
  proxyUrl: text('proxy_url'), // optional, provided by user
  registrySlug: text('registry_slug'), // if it matches an existing registry entry
  useCase: text('use_case').notNull(), // "I need this to sync notes from Notion"
  upvoteCount: integer('upvote_count').notNull().default(0),
  status: suggestionStatusEnum('status').notNull().default('pending_review'),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewerNote: text('reviewer_note'), // shown to user on rejection
  resultingServerTypeId: uuid('resulting_server_type_id').references(() => mcpServerTypes.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const suggestionStatusEnum = pgEnum('suggestion_status', [
  'pending_review',
  'under_review', // admin has started looking at it
  'approved', // server type created
  'rejected', // with reviewer note
  'already_exists', // a matching server type already exists in the org
]);
```

#### Upvoting

Other org members can upvote a suggestion. `upvoteCount` makes it easy for admins to
prioritize high-demand requests. A new table `connectorSuggestionVotes` tracks unique votes
(same pattern as the existing `votes` table in the knowledge base).

#### Suggestion lifecycle

```
User submits suggestion (name + use case + optional URL)
  ↓
System: check if a matching registry entry or active server type already exists
  → if yes: status = "already_exists", user is pointed to existing connector
  → if no: status = "pending_review", admin notified via alert (Gap 4)
  ↓
Other users can upvote the suggestion
  ↓
Admin reviews queue, sorted by upvote count:
  → "Approve": triggers normal connector registration flow (Phase 3 §C install flow)
     resultingServerTypeId is set; user and upvoters are notified
  → "Reject": status = "rejected" + reviewerNote; user is notified
```

#### New routes

```
POST   /api/orgs/:id/mcp/connector-suggestions           user submits suggestion
GET    /api/orgs/:id/mcp/connector-suggestions           list (admin sees all, user sees own)
POST   /api/orgs/:id/mcp/connector-suggestions/:id/vote  upvote a suggestion
PATCH  /api/orgs/:id/mcp/connector-suggestions/:id       admin review (approve / reject)
```

The "approve" PATCH action accepts `{ action: "approve", serverTypeConfig: { ... } }` — the
admin can supply the full registration config inline, or the system pre-fills it from the
user's provided URL (fetched manifest attached to the suggestion record).

#### Frontend

- "Suggest a Tool" button in the Connector Marketplace header (visible to all members).
- Suggestion form: name, URL (optional), use case description.
- "Requested by your team" section in the marketplace showing pending suggestions with upvote
  counts — members can upvote before the admin decides.
- Admin queue: "Connector Requests" tab alongside "Active Connectors" in the admin panel.

---

## Gap 4: Alert and Notification System

**Amends:** Phase 2 (observability), Phase 4 (Shadow AI)

### Problem

Phase 2 designs dashboards for cost, guard effectiveness, and the review queue. Phase 4
designs the Shadow AI dashboard. All of these are reactive — an admin must actively check the
UI to notice problems. No design covers proactive alerts: budget warnings, guard block spikes,
Shadow AI detections, OAuth refresh failures, manifest re-scan flags, or new connector
version availability. Phase 2 references "existing notification infrastructure" for escalation
emails but that infrastructure was never designed.

### Design

#### New table: `alertConfigs`

```typescript
export const alertConfigs = pgTable('alert_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  alertType: alertTypeEnum('alert_type').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  thresholdValue: doublePrecision('threshold_value'), // e.g. 0.8 = 80% of budget
  channels: jsonb('channels').notNull(), // see Channel format below
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alertTypeEnum = pgEnum('alert_type', [
  'budget_warning', // user or org budget hit threshold (default 80%)
  'budget_exceeded', // user or org budget fully consumed
  'guard_block_spike', // block rate > N× baseline in last hour
  'shadow_ai_detected', // new Shadow AI source appeared
  'manifest_flagged', // manifest re-scan flagged new tools on approved connector
  'connection_expired', // OAuth refresh failed for a user's connection
  'connector_update', // new version available for an installed connector
  'scim_deprovision', // user was deprovisioned (sent to remaining admins)
  'connector_suggested', // new connector suggestion submitted by a member
  'review_queue_backlog', // unreviewed guard events > N items (default 50)
]);
```

#### Channel format (JSONB)

```typescript
// channels: Array<Channel>
type Channel =
  | { type: 'email'; recipients: string[] } // email addresses
  | { type: 'webhook'; url: string; secret?: string } // HMAC-signed POST
  | { type: 'in_app' }; // in-app notification bell
```

In-app is always enabled and cannot be disabled. Email and webhook are opt-in. The webhook
payload format matches the audit event structure for easy SIEM integration.

#### New table: `alertEvents`

```typescript
export const alertEvents = pgTable('alert_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  alertConfigId: uuid('alert_config_id').references(() => alertConfigs.id),
  alertType: alertTypeEnum('alert_type').notNull(),
  severity: severityEnum('severity').notNull(),
  payload: jsonb('payload').notNull(), // alert-specific context
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  deliveryError: text('delivery_error'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

#### Alert delivery service

```typescript
// packages/backend/src/services/alert.service.ts

export class AlertService {
  async fire(orgId: string, type: AlertType, payload: Record<string, unknown>): Promise<void> {
    const config = await this.getAlertConfig(orgId, type);
    if (!config?.isEnabled) return;

    const event = await this.createAlertEvent(orgId, config.id, type, payload);

    for (const channel of config.channels) {
      await this.deliverToChannel(channel, event).catch(err => {
        this.updateDeliveryError(event.id, err.message);
      });
    }
  }
}
```

`AlertService.fire()` is called from:

- Budget middleware (Phase 2) when user or org budget hits threshold or is exceeded
- Guard logger (Phase 2) when block rate spike is computed in the background
- Shadow AI service (Phase 4) on new source detection
- Manifest scanner (Phase 3) when re-scan finds new flags
- OAuth refresh scheduler (Gap 1) on refresh failure
- SCIM service (Phase 3) on user deprovision
- Connector version checker (Gap 7) on new version available

#### Default alert configs

When an org is created, a set of default alert configs is seeded:

| Type                   | Default threshold | Default channels               |
| ---------------------- | ----------------- | ------------------------------ |
| `budget_warning`       | 80%               | in_app                         |
| `budget_exceeded`      | —                 | in_app + email (admins)        |
| `guard_block_spike`    | 3× baseline       | in_app + email (admins)        |
| `manifest_flagged`     | —                 | in_app + email (admins)        |
| `connection_expired`   | —                 | in_app + email (affected user) |
| `connector_update`     | —                 | in_app (admins only)           |
| `connector_suggested`  | —                 | in_app (admins only)           |
| `review_queue_backlog` | 50 items          | in_app + email (admins)        |

Shadow AI and SCIM deprovision alerts are off by default (require customer to opt in).

#### Webhook payload format

```json
{
  "id": "uuid",
  "orgId": "uuid",
  "alertType": "budget_exceeded",
  "severity": "high",
  "payload": {
    "userId": "uuid",
    "userEmail": "alice@company.com",
    "budgetType": "daily_user",
    "limitTokens": 50000,
    "consumedTokens": 50123,
    "serverTypeSlug": "github"
  },
  "createdAt": "2026-05-12T14:32:00Z"
}
```

Webhook requests include an `X-AgentInSync-Signature` HMAC-SHA256 header (secret configured
per channel) so the receiver can verify authenticity.

#### New routes

```
GET    /api/orgs/:id/mcp/alert-configs              list configured alerts
PUT    /api/orgs/:id/mcp/alert-configs/:type        update config for one alert type
GET    /api/orgs/:id/mcp/alert-events               paginated alert event history
PATCH  /api/orgs/:id/mcp/alert-events/:id/resolve   mark alert as resolved
```

---

## Gap 5: `mcp:read` vs `mcp:write` Action Enforcement

**Amends:** Phase 2 (RBAC/ABAC)

### Problem

Phase 2 defines the `action` enum as `"mcp:execute" | "mcp:read" | "mcp:write"` on
`mcpToolPermissions` and notes _"Phase 1 only has execute; read/write distinction is Phase
3+ concern"_ — but it was never picked up in Phase 3 or 4. The columns exist in the schema
but carry no enforcement semantics. This matters: an org may want analysts to be able to
query a database connector but not write to it, or read GitHub issues but not create them.
Without enforcement, `mcp:read` and `mcp:write` permission rules are silently ignored.

### Design

#### Tool action classification

Each tool in a connector's manifest is classified as `read`, `write`, or `execute`
(unconstrained). The classification comes from the connector SDK at registration time, with
admin override capability.

```typescript
export const toolActionClassifications = pgTable('mcp_tool_action_classifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverTypeId: uuid('server_type_id')
    .notNull()
    .references(() => mcpServerTypes.id),
  toolName: text('tool_name').notNull(),
  action: toolActionEnum('action').notNull().default('execute'),
  setByConnector: boolean('set_by_connector').notNull().default(true),
  // false = admin manually overrode the connector's classification
});

export const toolActionEnum = pgEnum('tool_action', ['read', 'write', 'execute']);
```

At connector install time, the gateway derives classification from the connector manifest's
`capabilities` array:

- Tool name contains `list`, `get`, `search`, `read`, `fetch`, `query` → `read`
- Tool name contains `create`, `update`, `delete`, `send`, `post`, `write`, `push` → `write`
- Ambiguous or uncategorized → `execute` (unconstrained)

This heuristic is applied at install time and stored per tool. Admin can override any row.

#### Permission evaluation update (Phase 2 §A)

The `evaluatePermission` function gains one additional check after finding a matching allow
rule:

```typescript
// After RBAC role check passes and ABAC conditions pass:
if (rule.action !== 'mcp:execute') {
  // The rule has a specific action scope — verify the requested tool qualifies
  const classification = await getToolClassification(serverType.id, toolName);
  const toolAction = classification?.action ?? 'execute';

  if (rule.action === 'mcp:read'  && toolAction !== 'read')  return { allowed: false, ... };
  if (rule.action === 'mcp:write' && toolAction !== 'write') return { allowed: false, ... };
  // If rule is mcp:execute, any toolAction is allowed
}
```

This means:

- A rule with `action: mcp:execute` allows calling any tool (existing behavior — no change)
- A rule with `action: mcp:read` only allows tools classified as `read`
- A rule with `action: mcp:write` only allows tools classified as `write`

#### Example permission configurations

```typescript
// Analysts can read any tool on the database connector
{ toolName: '*', action: 'mcp:read',    minRole: 'member',   isAllowed: true }

// Reviewers can also write
{ toolName: '*', action: 'mcp:write',   minRole: 'reviewer', isAllowed: true }

// Admins have full execute (unconstrained)
{ toolName: '*', action: 'mcp:execute', minRole: 'admin',    isAllowed: true }
```

An analyst calling `database:insert` (classified as `write`) fails the read-only rule and
falls through to the default policy (deny).

#### `tools/list` filtering

Tools are filtered by the requesting user's effective permission set. A user with only
`mcp:read` permissions sees only read-classified tools in their manifest. Write-classified
tools are invisible to them — saving context window tokens and eliminating the temptation
to call tools that would be rejected.

#### Admin UI addition

In the permission rules editor (Phase 2 frontend), the action selector now has three
meaningful options with explanations: "Execute (any tool)", "Read only", "Write only".
Each connector's tool list shows the classification badge (read/write/execute) next to
each tool name, with an override button.

---

## Gap 6: Audit Log Retention Policy

**Amends:** Phase 4 (compliance export)

### Problem

Phase 4 designs compliance export (SOC 2, GDPR, HIPAA) and references retention periods in
the ISO 27001 context, but never designs the retention system itself. No phase specifies:
how long audit rows are kept, what happens when they age out, how GDPR's right to erasure
applies to audit data, or who can configure retention. Without this, audit tables grow
indefinitely and the gateway has no documented data lifecycle — a compliance failure for any
enterprise customer.

### Design

#### Schema additions to `organizations`

```typescript
auditRetentionDays:   integer('audit_retention_days').notNull().default(90),
auditArchiveBucket:   text('audit_archive_bucket'),    // S3/GCS URI, null = delete without archive
auditComplianceMode:  complianceModeEnum('audit_compliance_mode').notNull().default('standard'),
```

```typescript
export const complianceModeEnum = pgEnum('compliance_mode', [
  'standard', // admin-configurable retention (minimum 30 days)
  'soc2', // minimum 365 days (enforced, not overridable)
  'gdpr', // minimum 365 days + pseudonymization on user deletion
  'hipaa', // minimum 2555 days (7 years, enforced)
]);
```

`complianceMode` enforces a floor: if `auditRetentionDays < complianceMode_minimum`, the
system uses the mode's minimum. The admin cannot set a shorter retention than the selected
compliance mode requires.

#### Retention job

A nightly background job (using the existing backend cron infrastructure or a Turborepo
scheduled task):

```typescript
// packages/backend/src/jobs/auditRetention.ts

async function runAuditRetention(): Promise<void> {
  const orgs = await db
    .select({ id, retentionDays, archiveBucket, complianceMode })
    .from(organizations);

  for (const org of orgs) {
    const effectiveRetention = Math.max(org.retentionDays, COMPLIANCE_MINIMUMS[org.complianceMode]);
    const cutoff = subDays(new Date(), effectiveRetention);

    const expiredRows = await db
      .select()
      .from(mcpAuditLog)
      .where(and(eq(mcpAuditLog.organizationId, org.id), lt(mcpAuditLog.createdAt, cutoff)))
      .limit(10000); // batch in chunks to avoid long-running transactions

    if (expiredRows.length === 0) continue;

    if (org.archiveBucket) {
      await archiveToObjectStorage(org.archiveBucket, expiredRows); // JSONL gzip
    }

    await db.delete(mcpAuditLog).where(
      inArray(
        mcpAuditLog.id,
        expiredRows.map(r => r.id)
      )
    );
  }
}
```

Archival writes a JSONL gzip file per org per day:
`s3://bucket/orgId/audit/2026-05-12.jsonl.gz`. This preserves the data for cold
compliance review without consuming PostgreSQL storage.

#### GDPR right to erasure (pseudonymization)

When a user exercises their right to erasure, fully deleting their audit rows would break the
tamper-evident chain (Phase 4 `rowHash` / `previousHash`). Instead, the gateway
pseudonymizes their rows:

```typescript
async function pseudonymizeUserAuditRows(userId: string, orgId: string): Promise<void> {
  await db
    .update(mcpAuditLog)
    .set({
      userId: null, // foreign key cleared
      agentId: null,
      apiKeyId: null,
      requestParams: sql`'{"redacted": "gdpr_erasure"}'::jsonb`,
      piiMasked: sql`'[{"path": "*", "type": "gdpr_erasure"}]'::jsonb`,
    })
    .where(and(eq(mcpAuditLog.organizationId, orgId), eq(mcpAuditLog.userId, userId)));
}
```

The row is retained (chain integrity preserved) but stripped of all personal data. A
`gdpr_erasure_at` timestamp column is added to mark pseudonymized rows.

```typescript
// New column on mcpAuditLog
gdprErasedAt: timestamp('gdpr_erased_at', { withTimezone: true }),
```

#### New routes

```
GET    /api/orgs/:id/mcp/audit-retention           current retention config
PUT    /api/orgs/:id/mcp/audit-retention           update retention settings (admin)
POST   /api/orgs/:id/mcp/audit-retention/preview   estimate rows that would be deleted
POST   /api/users/:userId/mcp/audit/gdpr-erase     pseudonymize user's audit rows (admin)
```

---

## Gap 7: Connector Version Management

**Amends:** Phase 3 (connector registry + connector SDK)

### Problem

Phase 3 designs connector installation and 24h manifest refresh, but never addresses the
connector version lifecycle. When a verified connector ships a breaking change (tool renamed,
tool removed, OAuth scope changed), installed server types silently receive the new behavior
on the next manifest refresh — without admin awareness or approval. For a `delete_repository`
tool that was constrained by a parameter policy, a rename to `remove_repository` silently
bypasses the policy. Version management is a security property, not just a UX feature.

### Design

#### Schema additions to `mcpConnectorRegistry`

```typescript
changelog: jsonb('changelog'), // VersionEntry[]
// [{ version: "2.0.0", breakingChanges: ["Renamed: delete_repo → remove_repo"],
//    addedTools: ["archive_repo"], removedTools: ["delete_repo"], publishedAt: "..." }]
```

#### Schema additions to `mcpServerTypes`

```typescript
installedVersion:  text('installed_version'),   // semver of currently active connector version
availableVersion:  text('available_version'),   // null if up to date
autoUpgrade:       autoUpgradeEnum('auto_upgrade').notNull().default('patch'),
lastVersionCheckAt:timestamp('last_version_check_at', { withTimezone: true }),
```

```typescript
export const autoUpgradeEnum = pgEnum('auto_upgrade', [
  'patch', // auto-apply patch bumps (1.0.0 → 1.0.1); review minor and major
  'minor', // auto-apply patch + minor (1.0.0 → 1.1.0); review major
  'never', // all upgrades require admin review
]);
```

#### Version check job

Every 6 hours, a background job compares `mcpServerTypes.installedVersion` against
`mcpConnectorRegistry.version` for all installed connectors:

```typescript
async function checkConnectorVersions(): Promise<void> {
  const installed = await db
    .select({
      serverTypeId,
      installedVersion,
      autoUpgrade,
      connectorSlug,
    })
    .from(mcpServerTypes)
    .where(isNotNull(mcpServerTypes.installedVersion));

  for (const inst of installed) {
    const latest = await getRegistryEntry(inst.connectorSlug);
    if (!latest || !semver.gt(latest.version, inst.installedVersion)) continue;

    const bump = semver.diff(inst.installedVersion, latest.version);
    // 'patch' | 'minor' | 'major' | 'premajor' | 'preminor' | 'prepatch' | 'prerelease'

    const shouldAutoUpgrade =
      (inst.autoUpgrade === 'patch' && bump === 'patch') ||
      (inst.autoUpgrade === 'minor' && (bump === 'patch' || bump === 'minor'));

    if (shouldAutoUpgrade) {
      await applyVersionUpgrade(inst.serverTypeId, latest);
    } else {
      await markVersionAvailable(inst.serverTypeId, latest.version);
      await alertService.fire(orgId, 'connector_update', {
        connectorSlug: inst.connectorSlug,
        installedVersion: inst.installedVersion,
        availableVersion: latest.version,
        breakingChanges: latest.changelog?.find(e => e.version === latest.version)?.breakingChanges,
      });
    }
  }
}
```

#### Upgrade flow for reviewed upgrades

```
Admin sees "Update available: GitHub v2.0.0" in the Connector Marketplace
  ↓
Admin clicks "Review Changes"
  → Diff view: old tool manifest vs new tool manifest
     Added tools (green), removed tools (red), renamed tools (yellow), changed schemas (blue)
  → Breaking changes highlighted: "delete_repo renamed to remove_repo — check your policies"
  ↓
Admin clicks "Apply Update"
  ↓
Backend:
  1. Fetch new manifest from upstream; run manifest poisoning scan (Phase 3 §B)
  2. If scan flagged: require override acknowledgment before proceeding
  3. Re-run org's evaluation dataset against new manifest (Phase 2 §G)
  4. If evaluation accuracy drops > 10%: show warning "guard rule effectiveness may be reduced"
  5. Update toolManifest, installedVersion, clear availableVersion
  6. Update Weaviate GatewayTool index (Phase 4 §G)
  7. Policy push to all data planes (Phase 4 gRPC WatchPolicies)
```

#### Policy impact analysis

When a tool is renamed or removed in an upgrade, existing permission rules and parameter
policies that reference the old tool name become orphaned. The upgrade preview shows:

```
⚠️ Policy impact detected:
  - 2 permission rules reference "delete_repo" (now renamed to "remove_repo")
  - 1 parameter policy references "delete_repo"
  These rules will be migrated automatically to "remove_repo". Confirm?
```

The gateway attempts automatic migration for exact renames documented in the changelog.
Ambiguous cases are flagged for admin manual review.

---

## Schema Migration Summary

All schema changes in this addendum require a single Drizzle migration:

**New tables:** `userToolPreferences`, `connectorSuggestions`, `connectorSuggestionVotes`,
`alertConfigs`, `alertEvents`, `toolActionClassifications`

**New columns:**

- `mcpServerConnections`: `refreshStatus`, `refreshFailedAt`, `refreshFailedReason`
- `mcpAuditLog`: `gdprErasedAt`
- `mcpServerTypes`: `installedVersion`, `availableVersion`, `autoUpgrade`, `lastVersionCheckAt`
- `mcpConnectorRegistry`: `changelog`
- `organizations`: `auditRetentionDays`, `auditArchiveBucket`, `auditComplianceMode`

**New enums:** `refreshStatusEnum`, `suggestionStatusEnum`, `alertTypeEnum`,
`toolActionEnum`, `autoUpgradeEnum`, `complianceModeEnum`

Run once: `pnpm --filter @agent-in-sync/db-client db:generate` and commit the SQL file
and `_journal.json` together.

---

## Route Summary (all new routes from this addendum)

```
# Gap 1 — OAuth Refresh
POST /api/users/me/mcp/connections/:connectionId/reconnect

# Gap 2 — User Tool Preferences
GET  /api/users/me/mcp/tool-preferences
PUT  /api/users/me/mcp/tool-preferences/:serverTypeId

# Gap 3 — Connector Suggestions
POST /api/orgs/:id/mcp/connector-suggestions
GET  /api/orgs/:id/mcp/connector-suggestions
POST /api/orgs/:id/mcp/connector-suggestions/:id/vote
PATCH /api/orgs/:id/mcp/connector-suggestions/:id

# Gap 4 — Alerts
GET  /api/orgs/:id/mcp/alert-configs
PUT  /api/orgs/:id/mcp/alert-configs/:type
GET  /api/orgs/:id/mcp/alert-events
PATCH /api/orgs/:id/mcp/alert-events/:id/resolve

# Gap 5 — Tool Action Classification
GET  /api/orgs/:id/mcp/server-types/:typeId/tool-classifications
PUT  /api/orgs/:id/mcp/server-types/:typeId/tool-classifications/:toolName

# Gap 6 — Audit Retention
GET  /api/orgs/:id/mcp/audit-retention
PUT  /api/orgs/:id/mcp/audit-retention
POST /api/orgs/:id/mcp/audit-retention/preview
POST /api/users/:userId/mcp/audit/gdpr-erase

# Gap 7 — Connector Versions
GET  /api/orgs/:id/mcp/server-types/:typeId/version-diff   # old vs new manifest diff
POST /api/orgs/:id/mcp/server-types/:typeId/upgrade        # apply pending version upgrade
```

---

## Phase Placement Recommendation

| Gap                           | Recommended phase | Rationale                                                                                        |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| Gap 1 — OAuth refresh         | Phase 2           | Correctness: OAuth tokens expire; silently failing connections are a P0 bug in production        |
| Gap 4 — Alerting              | Phase 2           | Budget alerts and guard spike alerts are only useful if shipped alongside the financial firewall |
| Gap 6 — Audit retention       | Phase 2           | Compliance buyers ask about retention on the first call; needed before first enterprise deal     |
| Gap 5 — mcp:read/write        | Phase 2           | The schema is already in Phase 2; adding enforcement is a small authz code change                |
| Gap 2 — User tool preferences | Phase 3           | UX enhancement; depends on connector marketplace being live                                      |
| Gap 3 — Connector suggestions | Phase 3           | Depends on connector marketplace and registry from Phase 3                                       |
| Gap 7 — Connector versioning  | Phase 3           | Depends on connector SDK and registry from Phase 3                                               |

Gaps 1, 4, 5, and 6 should be treated as **blocking requirements** for Phase 2, not deferred
work. They are correctness and compliance issues rather than product features. Gaps 2, 3, and
7 are product enhancements that fit naturally in Phase 3.

---

_Created: 2026-05-12_
_Status: Draft — amends Design Logs #054, #055, #056, #057_
