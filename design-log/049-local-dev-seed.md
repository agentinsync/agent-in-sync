# Design Log #049: Local Dev Seed Script

## Background

The project has a production-grade seed script (`seed-public-content.ts`) that populates the Public org with LLM-rewritten issues and solutions from Stack Overflow and GitHub. It requires LLM API keys, takes significant time, and is designed for production bootstrapping.

Local development environments are missing realistic multi-tenant data: no fake organizations, no human-like users with varied roles, and no seed context for running the public content pipeline locally.

## Problem

Developers running the stack locally have an empty database with only the Public org (if they've run the public seed). There are no fake tenant organizations, no users with different roles to test org isolation, and no easy way to wire the existing `seed-public-content.ts` into a local environment without manually bootstrapping UUIDs.

## Questions and Answers

> Q: Should fake users be loggable (email/password)?

A: No. Auth is OAuth-only (GitHub/Google). Fake users exist as DB records for realistic data — developers log in with their own OAuth account.

> Q: How should super admin be handled in the seed?

A: Not at all. Super admin is configured via `SUPER_ADMIN_EMAILS` env var, synced to the DB on startup by `syncSuperAdminFlags()`. No seed involvement needed.

> Q: How do issues/solutions get seeded locally?

A: `seed-dev.ts` writes a `seed-context.json` file matching the `SeedContextFile` type. The developer then runs the existing `seed-public-content.ts --context seed-context.json` to populate issues/solutions using local UUIDs — no re-bootstrapping needed.

> Q: Should `seed-context.json` be regenerated on every run?

A: No. Skip generation if the file already exists. This preserves UUIDs across re-runs and prevents accidentally invalidating a context file the developer is actively using with the public seed.

## Design

**New file:** `scripts/seed/seed-dev.ts`

Idempotent script that creates the local dev data foundation and writes a context file for use with the existing public seed pipeline.

### Fake Organizations

Three non-public tenant orgs:

| Name      | Slug        |
| --------- | ----------- |
| Acme Corp | `acme`      |
| TechStart | `techstart` |
| DevTeam   | `devteam`   |

### Fake Users

~3 users per org, one of each role:

| Email pattern              | Role       |
| -------------------------- | ---------- |
| `admin@<slug>.dev.seed`    | `admin`    |
| `reviewer@<slug>.dev.seed` | `reviewer` |
| `member@<slug>.dev.seed`   | `member`   |

All users have `emailVerified: true`. No sessions or accounts are created — users are data only.

### Agents

Two agents per fake org, using a subset of `AGENT_PERSONAS` from `agents.ts`. The Public org is bootstrapped with the full 5 personas via the existing `bootstrapAgents()`.

### Context File Output

After bootstrapping, writes `scripts/seed/seed-context.json` (skipped if file already exists):

```typescript
type SeedContextFile = {
  publicOrgId: string;
  agents: BootstrappedAgent[]; // Public org agents only
  existingTags: []; // empty for fresh local env
  createdAt: string;
};
```

`seed-context.json` is added to `.gitignore` — it contains local UUIDs not meaningful to other developers.

### Dev Workflow

```bash
# Step 1: Create orgs, users, agents, write seed-context.json (first run only for context file)
pnpm exec tsx scripts/seed/seed-dev.ts

# Step 2: Seed issues/solutions using local IDs (requires LLM env vars)
pnpm exec tsx scripts/seed/seed-public-content.ts \
  --context scripts/seed/seed-context.json \
  --count 50 --source stackoverflow
```

Re-running `seed-dev.ts` is safe — all entity creation is idempotent via slug/email checks.

## Implementation Plan

1. **Write `seed-dev.ts`**: create orgs, users (with org memberships), agents per org, bootstrap Public org, write `seed-context.json` if not present
2. **Update `.gitignore`**: add `scripts/seed/seed-context.json`
3. **Add `seed:dev` script** to root `package.json` for convenience

## Examples

✅ Idempotent org creation (matches existing pattern from `agents.ts`):

```typescript
const [existing] = await db
  .select({ id: organizations.id })
  .from(organizations)
  .where(eq(organizations.slug, org.slug))
  .limit(1);

if (existing) return existing.id;

const [created] = await db
  .insert(organizations)
  .values({ name: org.name, slug: org.slug })
  .returning({ id: organizations.id });
```

❌ Overwriting `seed-context.json` on every run:

```typescript
// Don't do this — would invalidate context for an in-progress public seed run
writeFileSync(CONTEXT_PATH, JSON.stringify(ctx));
```

✅ Skip if exists:

```typescript
if (!existsSync(CONTEXT_PATH)) {
  writeFileSync(CONTEXT_PATH, JSON.stringify(ctx, null, 2));
  console.log(`Wrote seed-context.json`);
} else {
  console.log(`seed-context.json already exists — skipped`);
}
```

## Trade-offs

| Pros                                                             | Cons                                            |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| No LLM env vars required for step 1                              | Issues/solutions still need LLM pipeline        |
| Reuses existing inserter/agents code                             | Fake users can't log in directly                |
| `seed-context.json` wires cleanly into existing `--context` flag | Context file must be regenerated if DB is wiped |
| Idempotent — safe to re-run                                      |                                                 |

## Implementation Notes

Key files:

- `scripts/seed/seed-dev.ts` — new script (to be created)
- `scripts/seed/agents.ts` — reuse `AGENT_PERSONAS`, `bootstrapAgents()`, `ensurePublicOrg()`
- `scripts/seed/types.ts` — reuse `SeedContextFile`, `BootstrappedAgent`
- `scripts/seed/seed-public-content.ts` — no changes, used as-is with `--context`
- `.gitignore` — add `scripts/seed/seed-context.json`

---

_Created: 2026-03-29_
_Status: Approved_
