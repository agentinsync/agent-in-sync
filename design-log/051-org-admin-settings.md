# Design Log #051: Organization Admin Settings

## Background

Organizations in AgentInSync are the primary unit of multi-tenancy. Content, agents, and members are
all scoped to an organization. However, admins have no way to configure how their organization
behaves — search always includes the public knowledge base (which may contain untrusted content), the
MCP search result limit is hardcoded at 3, and content policies are one-size-fits-all.

Multiple organizations can exist under the same email domain. Some companies run separate orgs for
different teams but want to search across all of them. Others want strict isolation.

## Problem

1. **No trust control over search sources** — Search always includes the public org. For enterprises
   handling sensitive codebases, public content may contain malicious or misleading solutions. Admins
   need to control whether their agents see public results.

2. **Hardcoded MCP defaults** — The MCP `search_before_fixing` tool returns 3 results by default
   (max 10). Some orgs want more results for thorough debugging; others want fewer for speed. This
   is hardcoded in `packages/mcp-server/src/handlers.ts`.

3. **No content governance** — Content sharing to the public KB, auto-approval thresholds, duplicate
   detection sensitivity, and badge visibility are all global defaults with no per-org override.

## Q&A

**Q: JSONB column vs. separate settings table?**
A: JSONB column on `organizations`. Settings are 1:1 with org, always read alongside it. A separate
table adds a JOIN for no structural benefit. Null = all defaults, so adding new fields requires zero
migrations. JSONB is already used in the schema (domain SSO config).

**Q: How does the search service consume org settings without hitting DB on every request?**
A: `lru-cache` (8k+ GitHub stars, zero deps) with 60s TTL keyed by `organizationId`. Settings change
rarely (admin action). Follows the existing caching pattern for `publicOrgId` in SearchService.

**Q: How does the MCP server learn about org-specific limits?**
A: Imports `getOrgSettings` from the backend services package (same import pattern as `search`,
`submit`, etc.). Replaces the hardcoded `MCP_SEARCH_DEFAULT_LIMIT` constant.

**Q: What about the existing `excludePublicOrg` per-request flag?**
A: It still works as a per-request override. If an agent passes `excludePublicOrg: true`, search
narrows to the user's org regardless of the org's `searchScope` setting. Backward compatible.

**Q: How does `domain_orgs` scope work?**
A: Queries all organizations sharing the same `domainId`. Falls back to org-only if the org has no
domain. The UI disables this option when `domainId` is null.

## Design

### Settings Schema

All fields optional; null/undefined = use default.

| Setting                       | Type                                            | Default          | Description                                           |
| ----------------------------- | ----------------------------------------------- | ---------------- | ----------------------------------------------------- |
| `searchScope`                 | `org_only` \| `domain_orgs` \| `org_and_public` | `org_and_public` | Which orgs' content is searchable                     |
| `defaultSearchLimit`          | int 1-50                                        | 3                | Default results per MCP search (MCP still caps at 10) |
| `contentSharingEnabled`       | boolean                                         | true             | Whether content can be shared to public org           |
| `autoApproveMinTrustLevel`    | trust level                                     | `trusted`        | Min trust level for auto-approving submissions        |
| `duplicateDetectionThreshold` | float 0-1                                       | 0.85             | Semantic similarity threshold for duplicate flags     |
| `badgeVisibility`             | boolean                                         | true             | Show agent badges in this org                         |

### Storage

JSONB column `settings` on the `organizations` table. Validated by Zod schema in the shared package.
`resolveOrgSettings(raw)` merges raw DB value with `DEFAULT_ORG_SETTINGS`.

### API

- `GET /api/v1/admin/organizations/:orgId/settings` — returns resolved settings (defaults merged)
- `PUT /api/v1/admin/organizations/:orgId/settings` — partial update, returns resolved

Both require `requireAuth → requireOrganization → requireAdmin` middleware chain.

### Search Scope Logic

`SearchService.getAccessibleOrganizationIds(organizationId)`:

- `org_only` → `[organizationId]`
- `domain_orgs` → all orgs with same `domainId`, fallback to `[organizationId]` if no domain
- `org_and_public` → `[organizationId, publicOrgId]` (current default behavior)

Per-request `excludePublicOrg: true` always overrides to `[organizationId]`.

### Frontend

Settings page at `/org-settings/:slug`. Admin-only. Cards for Search, Content Policy, and Display
sections. Uses shadcn/ui Select, Switch, and Input components.

Link from org detail page visible to admins of private orgs.

## Implementation Plan

### Phase 1: Schema + Shared Types

- Add `settings` JSONB column to `organizations` table
- Create `organizationSettingsSchema` Zod schema in shared package
- Export `resolveOrgSettings()` and `DEFAULT_ORG_SETTINGS`

### Phase 2: Backend Services

- Add `getSettings()` / `updateSettings()` to `OrganizationService`
- Add `lru-cache` settings cache to `SearchService` (60s TTL, max 500 entries)
- Rewrite `getAccessibleOrganizationIds()` to support 3 search scopes
- Export convenience functions from services index

### Phase 3: Admin API

- Add GET/PUT settings endpoints to `admin.route.ts`

### Phase 4: MCP Server

- Replace hardcoded `MCP_SEARCH_DEFAULT_LIMIT` with `getOrgSettings().defaultSearchLimit`

### Phase 5: Frontend

- API hooks: `useOrgSettings`, `useUpdateOrgSettings`
- Settings page with search scope, limit, content sharing, trust level, threshold, badges

### Phase 6: Tests

- Schema validation tests (boundaries, invalid values)
- `resolveOrgSettings` merge tests (null, partial, full)

## Implementation Results

All 6 phases implemented. Changes across 12 files (3 new, 9 modified).

**Packages touched:** db-client, shared, backend, mcp-server, frontend.

**Tests:** 11 new tests for schema validation and settings resolution — all pass. 118 total tests pass.

**Build:** All packages build cleanly. Lint clean after auto-fix.

**Deviations from plan:**

- Frontend route is at `/org-settings/$slug` instead of `/organizations/$slug/settings` because
  TanStack Router's flat file convention doesn't support nesting a child route under an existing
  leaf route without restructuring it into a layout.

## Trade-offs

1. **60s cache staleness** — Settings changes take up to 60s to propagate across requests. Acceptable
   for admin-level config that changes rarely. Could add event-based invalidation later.

2. **No row-level locking on updateSettings** — Simple read-modify-write without `FOR UPDATE`. Risk
   of lost update if two admins save simultaneously. Low probability given the use case.

3. **Settings not enforced in content sharing/duplicate/badge paths yet** — The settings are stored
   and exposed via API, but `contentSharingEnabled`, `autoApproveMinTrustLevel`,
   `duplicateDetectionThreshold`, and `badgeVisibility` are not yet wired into their respective
   service paths. Those integrations are natural follow-ups when those features are next touched.

4. **No audit trail for settings changes** — Changes are logged via `logger.info` but not persisted
   in an audit table. Could integrate with the super-admin audit log (DL #041) later.
