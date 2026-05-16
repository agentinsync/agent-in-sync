# Design Log #041: Super-Admin Console

## Background

AgentInSync has a "super-admin" concept: a platform-level role above organization roles (`member`, `reviewer`, `admin`). A user is a super-admin if `users.is_super_admin` is true in the DB **or** their email is in the `SUPER_ADMIN_EMAILS` env var.

Today there are 4 API-only endpoints under `/api/v1/super-admin/` (list orgs, list users, get user, delete org) protected by `requireSuperAdmin` middleware. There is **zero frontend UI** for this role -- no nav entry, no pages, no way for the frontend to even know the current user is a super-admin.

Meanwhile, the database has rich data that platform operators need visibility into: users with reputation/tier, organizations with content counts, agents with badges, content flags, domains with SSO status, share requests, and KPI events tracked to Axiom.

## Problem

1. **No operational visibility** -- Platform operators must use `curl` or Postman to perform basic platform management (list users, delete orgs). No dashboards, no aggregate stats.
2. **No cross-org moderation** -- Flagged content (`content_flags` table) exists but there's no global view. Each org is siloed.
3. **No user management** -- Cannot toggle super-admin, change tier, or inspect a user's full profile from the UI.
4. **Frontend is super-admin-unaware** -- Better Auth's `additionalFields` only includes `domainId`. The session object returned to the frontend has no `isSuperAdmin` field, so there's no way to conditionally show admin UI.

## Questions and Answers

> Q: How should the frontend learn the current user is a super-admin?

A: Add `isSuperAdmin` to Better Auth's `user.additionalFields` in `packages/backend/src/auth/auth.ts`. This makes it available in the session object returned by `useSession()` on the frontend without a separate API call. The field is already in the `users` table schema.

> Q: Should super-admin pages be a separate layout or nested under `_protected`?

A: Nested under `_protected` as `_protected.super-admin.tsx`. This reuses the existing sidebar/header and auth guard. The super-admin layout adds a secondary `isSuperAdmin` check and redirects non-admins to `/dashboard`.

> Q: Should we build a new `SuperAdminService` or extend the existing route file?

A: New `super-admin.service.ts` for platform-level queries (dashboard stats, cross-org aggregations). Keep the route file for HTTP concerns only. The service follows the existing `ServiceDependencies` pattern.

> Q: How granular should pagination be for Phase 1?

A: All list endpoints get `?page=&limit=&search=` from the start. Use the existing pagination pattern from `getOrganizationMembersWithAgentsPaged`. Default limit=20, max=50.

> Q: Should the dashboard stats be real-time or cached?

A: Cached with a short TTL (60s). Platform stats queries hit multiple tables with COUNT aggregations -- caching avoids hammering the DB on every page load. Use a simple in-memory cache in the service (no Redis needed at current scale).

> Q: Should write actions (toggle super-admin, delete org) require a confirmation code or just a dialog?

A: `ConfirmDialog` with a "type to confirm" pattern for destructive actions (delete org, revoke super-admin). Simple toggle dialog for non-destructive changes (change tier).

## Design

### Frontend Session Extension

```typescript
// packages/backend/src/auth/auth.ts — add to additionalFields
user: {
  additionalFields: {
    domainId: { type: 'string', required: false },
    isSuperAdmin: { type: 'boolean', required: false },
  },
},
```

The frontend can then check `session.data?.user?.isSuperAdmin` in the layout and nav.

### Route Structure

```
_protected.super-admin.tsx            — layout guard (redirects if !isSuperAdmin)
_protected.super-admin.index.tsx      — platform dashboard
_protected.super-admin.users.tsx      — users list
_protected.super-admin.users.$userId.tsx — user detail
_protected.super-admin.organizations.tsx — orgs list
_protected.super-admin.organizations.$orgId.tsx — org detail
_protected.super-admin.moderation.tsx — content flags queue
_protected.super-admin.agents.tsx     — agents list
_protected.super-admin.domains.tsx    — domains list
```

### Nav Group (conditional)

```typescript
// packages/frontend/src/routes/_protected.tsx — added to navGroups when isSuperAdmin
{
  label: 'Platform Admin',
  items: [
    { name: 'Platform', href: '/super-admin', icon: ShieldCheck },
    { name: 'Users', href: '/super-admin/users', icon: Users },
    { name: 'Organizations', href: '/super-admin/organizations', icon: Building2 },
    { name: 'Moderation', href: '/super-admin/moderation', icon: Flag },
    { name: 'Agents', href: '/super-admin/agents', icon: Bot },
    { name: 'Domains', href: '/super-admin/domains', icon: Globe },
  ],
}
```

### API Endpoints

All under `/api/v1/super-admin/`, all gated by `requireAuth` + `requireSuperAdmin`.

**Phase 1 — Dashboard:**

- `GET /dashboard` — returns aggregate counts and content health metrics

```typescript
interface DashboardResponse {
  counts: {
    users: number;
    organizations: number;
    agents: number;
    issues: number;
    solutions: number;
    apiKeys: number;
  };
  contentHealth: {
    pendingFlags: number;
    pendingShareRequests: number;
  };
}
```

**Phase 2 — Users:**

- `GET /users?search=&tier=&reputationLevel=&isSuperAdmin=&page=&limit=` — paginated, filterable
- `GET /users/:userId` — detail with memberships, API keys, activity (already exists, enhance)
- `PATCH /users/:userId` — update `isSuperAdmin`, `tier`

```typescript
const updateUserSchema = z.object({
  isSuperAdmin: z.boolean().optional(),
  tier: z.enum(['free', 'paid']).optional(),
});
```

**Phase 3 — Organizations:**

- `GET /organizations?search=&isPublic=&page=&limit=` — enhanced with member/content counts
- `GET /organizations/:orgId` — full detail with stats
- `PATCH /organizations/:orgId` — update `isPublic`
- `DELETE /organizations/:orgId` — already exists

**Phase 4 — Moderation:**

- `GET /moderation/flags?status=&contentType=&page=&limit=` — cross-org flags
- `PATCH /moderation/flags/:flagId` — resolve (dismiss, hide content, warn author)

**Phase 5 — Agents & Domains:**

- `GET /agents?search=&page=&limit=` — all agents across orgs
- `GET /domains?status=&page=&limit=` — all domains
- `PATCH /domains/:domainId` — force-verify or revoke

### Service Layer

```typescript
// packages/backend/src/services/super-admin.service.ts
export class SuperAdminService {
  constructor(private deps: ServiceDependencies) {}

  async getDashboardStats(): Promise<DashboardResponse> {
    /* COUNT queries with 60s cache */
  }
  async getUsers(filters: UserFilters): Promise<PaginatedResult<UserRow>> {
    /* ... */
  }
  async getUserDetail(userId: string): Promise<UserDetail> {
    /* ... */
  }
  async updateUser(userId: string, data: UpdateUserInput): Promise<void> {
    /* ... */
  }
  async getOrganizations(filters: OrgFilters): Promise<PaginatedResult<OrgRow>> {
    /* ... */
  }
  async getOrganizationDetail(orgId: string): Promise<OrgDetail> {
    /* ... */
  }
  async getFlags(filters: FlagFilters): Promise<PaginatedResult<FlagRow>> {
    /* ... */
  }
  async resolveFlag(flagId: string, resolution: FlagResolution): Promise<void> {
    /* ... */
  }
  async getAgents(filters: AgentFilters): Promise<PaginatedResult<AgentRow>> {
    /* ... */
  }
  async getDomains(filters: DomainFilters): Promise<PaginatedResult<DomainRow>> {
    /* ... */
  }
  async updateDomain(domainId: string, data: UpdateDomainInput): Promise<void> {
    /* ... */
  }
}
```

### Frontend API Hooks

```typescript
// packages/frontend/src/lib/api/super-admin.ts
export function useSuperAdminDashboard() {
  /* GET /super-admin/dashboard */
}
export function useSuperAdminUsers(filters) {
  /* GET /super-admin/users */
}
export function useSuperAdminUserDetail(userId) {
  /* GET /super-admin/users/:userId */
}
export function useUpdateUser() {
  /* PATCH /super-admin/users/:userId */
}
export function useSuperAdminOrganizations(filters) {
  /* GET /super-admin/organizations */
}
export function useSuperAdminOrgDetail(orgId) {
  /* GET /super-admin/organizations/:orgId */
}
export function useSuperAdminFlags(filters) {
  /* GET /super-admin/moderation/flags */
}
export function useResolveFlag() {
  /* PATCH /super-admin/moderation/flags/:flagId */
}
export function useSuperAdminAgents(filters) {
  /* GET /super-admin/agents */
}
export function useSuperAdminDomains(filters) {
  /* GET /super-admin/domains */
}
export function useUpdateDomain() {
  /* PATCH /super-admin/domains/:domainId */
}
```

### UI Patterns

All pages follow the established pattern from `_protected.settings.tsx`:

1. `PageHeader` with title and description
2. `Skeleton` during loading
3. `EmptyState` for no results
4. Data in `Card` sections or shadcn `Table`
5. `ConfirmDialog` for destructive actions
6. `toast` (sonner) for success/error feedback
7. Filters via `Input` (search) + `Select` (dropdowns) above the table

### Page Wireframes

**Dashboard:**

```
┌──────────────────────────────────────────────────┐
│ Platform Dashboard                                │
├────────┬────────┬────────┬────────┬────────┬─────┤
│ Users  │  Orgs  │ Agents │ Issues │ Solns  │ Keys│
│  142   │   23   │   47   │  1,203 │  3,891 │ 89  │
├────────┴────────┴────────┴────────┴────────┴─────┤
│                                                    │
│  Content Health              System Status         │
│  ┌─────────────────┐        ┌──────────────┐      │
│  │ 3 pending flags │        │ DB: healthy  │      │
│  │ 1 pending share │        │ Vec: healthy │      │
│  └─────────────────┘        └──────────────┘      │
└──────────────────────────────────────────────────┘
```

**Users List:**

```
┌──────────────────────────────────────────────────┐
│ Users                                             │
│ [Search...        ] [Tier ▼] [Rep Level ▼]       │
├──────────────────────────────────────────────────┤
│ Name    │ Email         │ Tier │ Rep   │ Orgs │⚡│
│ Alice   │ alice@co.com  │ paid │ expert│  3   │ ★│
│ Bob     │ bob@dev.io    │ free │ new   │  1   │  │
│ ...     │               │      │       │      │  │
├──────────────────────────────────────────────────┤
│ Showing 1-20 of 142          [< 1 2 3 ... 8 >]  │
└──────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Session Extension + Nav + Dashboard (MVP)

1. Add `isSuperAdmin` to Better Auth `additionalFields` in `auth.ts`
2. Create `_protected.super-admin.tsx` layout with guard
3. Add conditional "Platform Admin" nav group in `_protected.tsx`
4. Create `super-admin.service.ts` with `getDashboardStats()`
5. Add `GET /dashboard` to `super-admin.route.ts`
6. Create `_protected.super-admin.index.tsx` dashboard page
7. Create `packages/frontend/src/lib/api/super-admin.ts` with hooks

### Phase 2: User Management

1. Add `getUsers()`, `getUserDetail()`, `updateUser()` to service
2. Add `GET /users` (enhanced), `PATCH /users/:userId` endpoints
3. Create `_protected.super-admin.users.tsx` list page
4. Create `_protected.super-admin.users.$userId.tsx` detail page
5. Add Zod schemas in `packages/shared/src/schemas/super-admin.ts`

### Phase 3: Organization Management

1. Add `getOrganizations()`, `getOrganizationDetail()` to service
2. Add `GET /organizations` (enhanced), `GET /organizations/:orgId`, `PATCH /organizations/:orgId`
3. Create `_protected.super-admin.organizations.tsx` list page
4. Create `_protected.super-admin.organizations.$orgId.tsx` detail page

### Phase 4: Content Moderation

1. Add `getFlags()`, `resolveFlag()` to service
2. Add `GET /moderation/flags`, `PATCH /moderation/flags/:flagId`
3. Create `_protected.super-admin.moderation.tsx` with tabs (Pending/Resolved/All)

### Phase 5: Agents + Domains

1. Add `getAgents()`, `getDomains()`, `updateDomain()` to service
2. Add endpoints for agents and domains
3. Create list pages for both

### Phase 6: Audit Log (Future)

1. New `audit_log` table in schema
2. Middleware to log super-admin write actions
3. UI page with searchable, filterable log

## Examples

✅ Dashboard stats query (efficient, uses COUNT):

```typescript
async getDashboardStats(): Promise<DashboardResponse> {
  const db = this.deps.db;
  const [userCount, orgCount, agentCount, issueCount, solutionCount, keyCount] =
    await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(organizations),
      db.select({ count: count() }).from(agents),
      db.select({ count: count() }).from(issues),
      db.select({ count: count() }).from(solutions),
      db.select({ count: count() }).from(apiKeys),
    ]);
  // ...
}
```

✅ Super-admin guard layout (consistent with `_protected` pattern):

```typescript
function SuperAdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user?.isSuperAdmin) {
    navigate({ to: '/dashboard' });
    return null;
  }

  return <Outlet />;
}
```

❌ Don't check super-admin via a separate API call on every page load:

```typescript
// Wrong — adds latency and an extra request per navigation
const { data } = useQuery(['super-admin-check'], () => fetchApi('/super-admin/check'));
```

## Trade-offs

| Pros                                                      | Cons                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Full platform visibility from one place                   | 9 new frontend route files to maintain                                      |
| Reuses existing DB schema — no new tables (until Phase 6) | Dashboard COUNT queries may slow on very large datasets                     |
| Follows established UI patterns (PageHeader, Card, Table) | Super-admin session field adds a boolean to every session payload           |
| Conditional nav group keeps UI clean for regular users    | Better Auth additionalFields change requires frontend type update           |
| Cross-org moderation fills a real operational gap         | Phase 4-6 are significant backend work (new queries, flag resolution logic) |
| 60s cache on dashboard prevents DB hammering              | Cached stats may be slightly stale                                          |

## Key Files

- `packages/backend/src/auth/auth.ts` — add `isSuperAdmin` to `additionalFields`
- `packages/backend/src/auth/super-admin.ts` — existing super-admin check logic
- `packages/backend/src/auth/middleware.ts` — `requireSuperAdmin` middleware
- `packages/backend/src/routes/super-admin.route.ts` — expand with all new endpoints
- `packages/backend/src/services/super-admin.service.ts` — new service (platform queries)
- `packages/frontend/src/routes/_protected.tsx` — add conditional nav group
- `packages/frontend/src/routes/_protected.super-admin.tsx` — new layout guard
- `packages/frontend/src/lib/api/super-admin.ts` — new API hooks module
- `packages/shared/src/schemas/super-admin.ts` — Zod schemas for validation
- `packages/db-client/src/schema.ts` — Phase 6 only: `audit_log` table

---

## Implementation Results

_Implemented: 2026-03-10_

### All 6 phases completed

**Backend:**

- `packages/backend/src/auth/auth.ts` — added `isSuperAdmin` to `user.additionalFields`; added `session.create.before` hook to sync env flag to DB on login; added `user.create.after` hook to set flag on sign-up
- `packages/backend/src/auth/super-admin.ts` — added `syncSuperAdminFlags()` called on server startup to sync `SUPER_ADMIN_EMAILS` env var into the `users.is_super_admin` DB column so `get-session` reflects it immediately without re-login
- `packages/backend/src/index.ts` — calls `syncSuperAdminFlags()` on startup
- `packages/backend/src/services/super-admin.service.ts` — new service with all platform queries (dashboard stats with 60s cache, paginated users/orgs/flags/agents/domains/audit-log)
- `packages/backend/src/routes/super-admin.route.ts` — expanded from 4 to 14 endpoints, all gated by `requireAuth` + `requireSuperAdmin`
- `packages/db-client/src/schema.ts` — added `audit_log` table with indexes on `actorId`, `action`, `createdAt`
- `packages/backend/src/services/super-admin.service.test.ts` — 20 unit tests covering all service methods

**Frontend:**

- `packages/frontend/src/routes/_protected.super-admin.tsx` — layout guard checking `isSuperAdmin`
- `packages/frontend/src/routes/_protected.super-admin.index.tsx` — dashboard with KPI cards, content health, quick links
- `packages/frontend/src/routes/_protected.super-admin.users.tsx` — user list with search/filter/pagination
- `packages/frontend/src/routes/_protected.super-admin.users_.$userId.tsx` — user detail with memberships and API keys
- `packages/frontend/src/routes/_protected.super-admin.organizations.tsx` — org list with content counts
- `packages/frontend/src/routes/_protected.super-admin.organizations_.$orgId.tsx` — org detail with members
- `packages/frontend/src/routes/_protected.super-admin.moderation.tsx` — cross-org content flags queue
- `packages/frontend/src/routes/_protected.super-admin.agents.tsx` — all agents list
- `packages/frontend/src/routes/_protected.super-admin.domains.tsx` — domain management with verify/revoke
- `packages/frontend/src/routes/_protected.super-admin.audit.tsx` — audit log viewer
- `packages/frontend/src/lib/api/super-admin.ts` — TanStack Query hooks for all endpoints
- `packages/frontend/src/routes/_protected.tsx` — conditional "Platform Admin" nav group

### Deviations from original design

1. **Audit log moved to Phase 1 (not Phase 6):** The `audit_log` table and UI were implemented alongside the core features rather than deferred. All super-admin write operations log to the audit table immediately.

2. **Zod schemas stayed in route file:** The `updateUserSchema`, `updateOrgSchema`, `resolveFlagSchema`, and `updateDomainSchema` were defined inline in `super-admin.route.ts` rather than in a separate `shared/schemas/super-admin.ts`. They are only used server-side for request validation.

3. **Env-to-DB sync added:** The original design only described the `additionalFields` approach for the frontend session. Implementation revealed that `get-session` reads from the DB, so the env var needed to be synced to the `is_super_admin` column. This is done:
   - On **server startup** via `syncSuperAdminFlags()` (immediate, no re-login needed)
   - On **session creation** via a `session.create.before` hook (catches runtime env changes)
   - On **user sign-up** via a `user.create.after` hook (new users get the flag immediately)

4. **Nav icons differ slightly:** Used `ScrollText` for audit log and `ShieldCheck` for the platform dashboard entry (design showed `Building2` for orgs which was kept).

5. **No "System Status" panel on dashboard:** The wireframe showed DB/Vector health indicators. These were omitted — the existing `/health` endpoint covers this and it would require additional wiring to surface in the dashboard.

---

_Created: 2026-03-10_
_Status: Implemented_
