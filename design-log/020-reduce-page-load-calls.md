# Design Log #020: Reduce Page Load API Calls

## Background

Loading any protected page (e.g. `/search`) triggered 5 sequential/parallel network requests:

1. `GET /api/auth/get-session` — `beforeLoad` in `_protected.tsx`
2. `GET /api/v1/privacy/consent/status` — `beforeLoad` in `_protected.tsx`
3. `GET /api/auth/get-session` — `useSession()` via Better Auth React SDK in `ProtectedLayout`
4. `GET /api/organizations/my` — `useMyOrganizations()` in each page component
5. `POST /api/search` — the actual data request

The duplicate `get-session` was caused by two independent code paths: an imperative `authClient.getSession()` call in the router's `beforeLoad` and the reactive `useSession()` hook in the layout component, with no shared cache between them.

## Problem

- 5 network calls on every protected page load, 3 of which are overhead
- Duplicate session fetch with no deduplication
- Consent check on every navigation, not just when stale
- Each page independently fetched `/organizations/my` (8 pages doing the same call)
- No way for users to switch organizations — always used `orgs[0]`

## Questions and Answers

> Q: How to handle consent without a dedicated API call?

A: The backend already has a `requireConsent` middleware (`packages/backend/src/auth/require-consent.ts`) that returns HTTP 451 when consent is stale. We intercept 451 globally in `fetchApi` and redirect to `/consent`. No separate consent check needed.

> Q: Should we add a global org picker or just bundle orgs into the session?

A: Global org picker in the header. Users with multiple orgs can switch between them. Selection persists in localStorage.

> Q: What about searching across all orgs?

A: Keep single-org search (Option C). The public org is already included in every search. Cross-org search can be added later if needed (see Trade-offs).

## Design

### 1. Global 451 handling in `fetchApi`

Intercept HTTP 451 before the generic error handler. Redirect via `window.location.href = '/consent'`.

### 2. Remove `beforeLoad` from `_protected.tsx`

- Remove `authClient.getSession()` and `fetchApi('/v1/privacy/consent/status')`
- Auth gating moves to the component: `useEffect` redirects to `/login` when `!user && !isLoading`
- Existing loading spinner covers the transition

### 3. Organization context with global picker

- `OrganizationProvider` wraps protected layout, calls `useMyOrganizations()` once
- `useOrganization()` hook provides `{ organizations, selectedOrg, selectOrg, isLoading }`
- Selected org persisted in localStorage (`ais-selected-org-id`)
- Desktop: org `Select` dropdown in the header
- Mobile: org `Select` in the sidebar drawer

### 4. All pages consume org from context

Replace `useMyOrganizations()` + `orgs?.[0]?.id` pattern in all 8 route files with `useOrganization()`.

## Implementation Plan

1. Phase 1: Add 451 interception in `fetchApi`
2. Phase 2: Remove `beforeLoad`, move auth redirect to component
3. Phase 3: Create `OrganizationProvider` + `useOrganization` hook
4. Phase 4: Add org picker in layout (desktop header + mobile sidebar)
5. Phase 5: Update all 8 pages to use context
6. Phase 6: Tests, lint, typecheck

## Trade-offs

| Pros                                    | Cons                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| 5 calls reduced to 2 on page load       | Consent check is now reactive (451) instead of proactive                                |
| No duplicate session fetch              | Brief loading spinner before redirect to `/login` (vs instant `beforeLoad` redirect)    |
| Users can switch orgs via UI            | `useMyOrganizations()` still fetches on mount (but only once, cached by TanStack Query) |
| Org selection persists across sessions  | Cross-org search not supported (by design, can add later)                               |
| Single source of truth for selected org |                                                                                         |

## Implementation Results

All phases implemented. Results:

- **83/83 frontend tests passing** (including 5 new `use-organization` tests + 1 new `fetchApi` 451 test)
- **Lint clean**, **typecheck clean**
- No backend changes required

### Key files

- `packages/frontend/src/lib/api/client.ts` — 451 interception
- `packages/frontend/src/hooks/use-organization.tsx` — provider + hook
- `packages/frontend/src/hooks/use-organization.test.tsx` — tests
- `packages/frontend/src/routes/_protected.tsx` — layout changes (removed `beforeLoad`, added provider + pickers)
- `packages/frontend/src/routes/_protected.search.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.dashboard.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.issues.$id.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.account.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.organizations.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.organizations.$slug.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.api-keys.tsx` — uses `useOrganization()`
- `packages/frontend/src/routes/_protected.connect.tsx` — uses `useOrganization()`

### Deviations from design

None.

---

_Created: 2026-02-12_
_Status: Implemented_
