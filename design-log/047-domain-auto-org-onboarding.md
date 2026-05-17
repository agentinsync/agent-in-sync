# Design Log #047: Domain-Based Auto Org Onboarding

## Background

When a user signs up with a company email (e.g., `john@example.com`), the system already extracts the domain and calls `findOrCreateForUser` — creating a `domains` record and linking the user to it. This domain infrastructure exists but is not surfaced to the user during onboarding.

The CLI auth flow (`/cli-auth`) requires the user to have at least one organization before it can issue an API key. A brand-new user with a company email has a domain but no org, hitting a dead-end: "No organizations found. Create one from the dashboard first."

## Problem

1. **No org on first signup**: Domain is auto-created, but no organization is created alongside it. The user is in limbo — linked to a domain with no workspace.
2. **Dead-end in CLI auth**: New users who run `agent-in-sync setup` immediately after OAuth hit the CLI auth page with no org to select.
3. **Second user friction**: A colleague signing up with the same domain gets linked to the domain but not to any org — they have to discover and manually join.

## Questions and Answers

> Q: Should subsequent domain users be auto-joined to the default org?

A: Yes. The default org is the company's general workspace (equivalent to Slack's #general). Everyone from the same domain belongs there by default. Additional orgs are opt-in.

> Q: How do we distinguish the "default" org from additional orgs?

A: Add an `isDefault` boolean column to the `organizations` table. Only the auto-created org gets `isDefault: true`. Admins can create additional non-default orgs manually.

> Q: What if a user deletes the default org?

A: `isDefault` becomes orphaned — the domain has no default org. The CLI auth page falls back to inline org creation in this case. No automatic re-creation.

> Q: What slug/name should the auto-created org get?

A: Name = capitalized domain label (e.g., `example.com` → `"Example"`). Slug = domain label (`"example"`). If slug conflicts, append a short random suffix (`"example-a3f"`).

> Q: Should the default org be public or private?

A: Private (`isPublic: false`) by default. The domain admin can change it later. Private keeps data contained to verified domain members.

## Design

### Schema change

Add `isDefault` to `organizations`:

```typescript
isDefault: boolean('is_default').notNull().default(false),
```

### `findOrCreateForUser` change (`domain.service.ts`)

Inject `OrganizationService` dependency. After creating a new domain, also:

1. Create a default org (name from domain label, `isDefault: true`, linked to domain)
2. Add user as org `admin`

When joining an **existing** domain, check if it has a default org and auto-join the user to it as `member`.

```typescript
// After domain creation
const defaultOrg = await orgService.createOrganization(
  { name: orgName, slug: orgSlug, isDefault: true, domainId: domain.id },
  userId
);

// When joining existing domain
const defaultOrg = await orgService.getDefaultOrgForDomain(domainId);
if (defaultOrg) {
  await orgService.joinOrganization(defaultOrg.id, userId);
}
```

### New `OrganizationService` methods

- `getDefaultOrgForDomain(domainId: string): Promise<OrgRow | null>` — finds the org with `isDefault: true` for a domain
- `createOrganization` signature extended to accept `isDefault?: boolean`

### Slug generation helper (`organization.service.ts`)

```typescript
async function generateOrgSlug(db, baseName: string): Promise<string> {
  const base = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
  const existing = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, base))
    .limit(1);
  if (!existing.length) return base;
  return `${base}-${randomBytes(2).toString('hex')}`;
}
```

### CLI auth fallback (`_protected.cli-auth.tsx`)

When `organizations.length === 0`, render an inline "Create your workspace" mini-form (org name input + create button) instead of the dead-end message.

## Implementation Plan

1. **Phase 1 — Schema**: Add `isDefault` column to `organizations` table. Generate + push migration.
2. **Phase 2 — OrganizationService**: Add `getDefaultOrgForDomain` method. Extend `createOrganization` to accept `isDefault`.
3. **Phase 3 — DomainService**: Update `findOrCreateForUser` to create default org on new domain, and auto-join default org on existing domain. Inject `OrganizationService` via `ServiceDependencies`.
4. **Phase 4 — CLI auth**: Replace dead-end "no orgs" message with inline org creation form.

## Examples

✅ First user `john@example.com` signs up:

- Domain `example.com` created (`pending`)
- Org `Example` created (`isDefault: true`, `domainId` set, John is `admin`)
- CLI auth: org pre-selected, immediate authorize

✅ Second user `jane@example.com` signs up:

- Domain `example.com` already exists, Jane added as domain member
- Jane auto-joined to `Example` org as `member`
- CLI auth: org pre-selected, immediate authorize

✅ Jane's team creates a project org `example-search`:

- `isDefault: false`, Jane and teammates join manually
- New signups from `example.com` only auto-join `Example`, not `example-search`

❌ Auto-joining ALL orgs under a domain:

- Would put new users in project/team orgs they may not belong to
- `isDefault` flag prevents this

## Trade-offs

| Pros                                                         | Cons                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| Zero-friction onboarding — CLI works immediately after OAuth | Schema migration required                              |
| Colleagues auto-land in the same workspace                   | First slug conflict needs fallback logic               |
| No dead-ends in CLI auth flow                                | Domain admin must manually set up additional orgs      |
| Consistent with how Slack/Linear handle company workspaces   | `isDefault` can become stale if default org is deleted |

## Implementation Notes

Key files:

- `packages/db-client/src/schema.ts` — add `isDefault` to `organizations`
- `packages/backend/src/services/organization.service.ts` — add `getDefaultOrgForDomain`, extend `createOrganization`
- `packages/backend/src/services/domain.service.ts` — update `findOrCreateForUser` to create/join default org
- `packages/frontend/src/routes/_protected.cli-auth.tsx` — inline org creation fallback

---

_Created: 2026-03-17_
_Status: Approved_
