# Local Dev Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `scripts/seed/seed-dev.ts` that bootstraps 3 fake orgs, users, and agents locally and writes `seed-context.json` for use with the existing `seed-public-content.ts` pipeline.

**Architecture:** A single idempotent script with pure data-builder functions (testable) and async DB helpers. Reuses `ensurePublicOrg`, `bootstrapAgents`, `AGENT_PERSONAS` from `scripts/seed/agents.ts`. Writes `seed-context.json` on first run; skips on subsequent runs.

**Tech Stack:** TypeScript (ESM/NodeNext), Vitest, Drizzle ORM, `@agent-in-sync/db-client`

---

## File Map

| File                            | Action | Responsibility                                   |
| ------------------------------- | ------ | ------------------------------------------------ |
| `scripts/seed/seed-dev.ts`      | Create | Main script: pure builders + DB helpers + main() |
| `scripts/seed/seed-dev.test.ts` | Create | Unit tests for pure builder functions            |
| `package.json` (root)           | Modify | Add `seed:dev` convenience script                |

---

### Task 1: Write failing tests for pure builder functions

**Files:**

- Create: `scripts/seed/seed-dev.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// scripts/seed/seed-dev.test.ts
import { describe, it, expect } from 'vitest';
import { buildDevOrgs, buildDevUsers } from './seed-dev.js';

describe('buildDevOrgs', () => {
  it('returns exactly 3 orgs', () => {
    const orgs = buildDevOrgs();
    expect(orgs).toHaveLength(3);
  });

  it('returns orgs with name and slug', () => {
    const orgs = buildDevOrgs();
    for (const org of orgs) {
      expect(typeof org.name).toBe('string');
      expect(org.name.length).toBeGreaterThan(0);
      expect(typeof org.slug).toBe('string');
      expect(org.slug.length).toBeGreaterThan(0);
    }
  });

  it('returns orgs with unique slugs', () => {
    const orgs = buildDevOrgs();
    const slugs = orgs.map(o => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('returns expected orgs', () => {
    const orgs = buildDevOrgs();
    expect(orgs.map(o => o.slug)).toEqual(['acme', 'techstart', 'devteam']);
  });
});

describe('buildDevUsers', () => {
  it('returns 3 users per org', () => {
    const orgs = buildDevOrgs();
    const users = buildDevUsers(orgs);
    expect(users).toHaveLength(orgs.length * 3);
  });

  it('each org gets admin, reviewer, and member roles', () => {
    const orgs = buildDevOrgs();
    const users = buildDevUsers(orgs);
    for (const org of orgs) {
      const orgUsers = users.filter(u => u.orgSlug === org.slug);
      const roles = orgUsers.map(u => u.role).sort();
      expect(roles).toEqual(['admin', 'member', 'reviewer']);
    }
  });

  it('user emails include the org slug', () => {
    const orgs = buildDevOrgs();
    const users = buildDevUsers(orgs);
    for (const user of users) {
      expect(user.email).toContain(user.orgSlug);
    }
  });

  it('all emails are unique', () => {
    const orgs = buildDevOrgs();
    const users = buildDevUsers(orgs);
    const emails = users.map(u => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @agent-in-sync/scripts test -- scripts/seed/seed-dev.test.ts
```

Expected: FAIL with `Cannot find module './seed-dev.js'`

---

### Task 2: Implement pure builder functions

**Files:**

- Create: `scripts/seed/seed-dev.ts`

- [ ] **Step 1: Create the file with builder functions only**

```typescript
// scripts/seed/seed-dev.ts
#!/usr/bin/env tsx

import { writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  users,
  organizations,
  organizationMembers,
  agents,
} from '@agent-in-sync/db-client';
import { ensurePublicOrg, bootstrapAgents, AGENT_PERSONAS } from './agents.js';
import type { SeedContextFile } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXT_PATH = resolve(__dirname, 'seed-context.json');

export type DevOrg = { name: string; slug: string };
export type DevUser = {
  email: string;
  name: string;
  role: 'admin' | 'reviewer' | 'member';
  orgSlug: string;
};

export function buildDevOrgs(): DevOrg[] {
  return [
    { name: 'Acme Corp', slug: 'acme' },
    { name: 'TechStart', slug: 'techstart' },
    { name: 'DevTeam', slug: 'devteam' },
  ];
}

export function buildDevUsers(orgs: DevOrg[]): DevUser[] {
  return orgs.flatMap(org => [
    { email: `admin@${org.slug}.dev.seed`, name: `${org.name} Admin`, role: 'admin', orgSlug: org.slug },
    { email: `reviewer@${org.slug}.dev.seed`, name: `${org.name} Reviewer`, role: 'reviewer', orgSlug: org.slug },
    { email: `member@${org.slug}.dev.seed`, name: `${org.name} Member`, role: 'member', orgSlug: org.slug },
  ]);
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
pnpm --filter @agent-in-sync/scripts test -- scripts/seed/seed-dev.test.ts
```

Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add scripts/seed/seed-dev.ts scripts/seed/seed-dev.test.ts
git commit -m "feat: add dev seed builder functions with tests"
```

---

### Task 3: Add DB helper functions

**Files:**

- Modify: `scripts/seed/seed-dev.ts`

These are async DB operations — tested via manual run, not unit tests.

- [ ] **Step 1: Append DB helpers to `seed-dev.ts` (after the builder functions)**

```typescript
async function ensureOrg(org: DevOrg): Promise<string> {
  const db = getDb();
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
  if (!created) throw new Error(`Failed to create org: ${org.slug}`);
  console.log(`[Orgs] Created: ${org.slug} (${created.id})`);
  return created.id;
}

async function ensureUser(user: DevUser): Promise<string> {
  const db = getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(users)
    .values({ email: user.email, name: user.name, emailVerified: true })
    .returning({ id: users.id });
  if (!created) throw new Error(`Failed to create user: ${user.email}`);
  console.log(`[Users] Created: ${user.email}`);
  return created.id;
}

async function ensureMembership(
  orgId: string,
  userId: string,
  role: DevUser['role']
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId))
    )
    .limit(1);
  if (!existing) {
    await db.insert(organizationMembers).values({ organizationId: orgId, userId, role });
  }
}

async function ensureOrgAgent(
  persona: (typeof AGENT_PERSONAS)[number],
  orgSlug: string,
  orgId: string,
  createdByUserId: string
): Promise<void> {
  const db = getDb();
  const slug = `${persona.slug}-${orgSlug}`;
  const [existing] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.slug, slug))
    .limit(1);
  if (existing) return;
  await db.insert(agents).values({
    slug,
    displayName: `${persona.displayName} (${orgSlug})`,
    bio: persona.bio,
    avatarUrl: persona.avatar,
    createdByUserId,
    organizationId: orgId,
    isPublic: false,
  });
  console.log(`[Agents] Created: ${slug}`);
}
```

- [ ] **Step 2: Verify the file still compiles**

```bash
pnpm --filter @agent-in-sync/scripts test -- scripts/seed/seed-dev.test.ts
```

Expected: All 7 tests still PASS (no regressions)

---

### Task 4: Add main() and context file output

**Files:**

- Modify: `scripts/seed/seed-dev.ts`

- [ ] **Step 1: Append main() to `seed-dev.ts`**

```typescript
async function main(): Promise<void> {
  console.log('\n=== AgentInSync Dev Seed ===\n');

  const devOrgs = buildDevOrgs();
  const devUsers = buildDevUsers(devOrgs);

  // Step 1: Create fake orgs + users + memberships
  console.log('--- Creating fake organizations and users ---');
  const orgIds = new Map<string, string>(); // slug → id
  const adminUserIds = new Map<string, string>(); // orgSlug → admin userId

  for (const org of devOrgs) {
    const orgId = await ensureOrg(org);
    orgIds.set(org.slug, orgId);
  }

  for (const user of devUsers) {
    const orgId = orgIds.get(user.orgSlug);
    if (!orgId) throw new Error(`No orgId found for slug: ${user.orgSlug}`);
    const userId = await ensureUser(user);
    await ensureMembership(orgId, userId, user.role);
    if (user.role === 'admin') adminUserIds.set(user.orgSlug, userId);
  }

  // Step 2: Create 2 agents per fake org
  console.log('\n--- Creating agents for fake orgs ---');
  const agentPersonasForOrgs = AGENT_PERSONAS.slice(0, 2);
  for (const org of devOrgs) {
    const orgId = orgIds.get(org.slug)!;
    const adminUserId = adminUserIds.get(org.slug)!;
    for (const persona of agentPersonasForOrgs) {
      await ensureOrgAgent(persona, org.slug, orgId, adminUserId);
    }
  }

  // Step 3: Bootstrap Public org + agents (for seed-public-content.ts)
  console.log('\n--- Bootstrapping Public org and agents ---');
  const publicOrgId = await ensurePublicOrg();
  const publicAgents = await bootstrapAgents(publicOrgId);

  console.log(`\nPublic org: ${publicOrgId}`);
  console.log(`Public agents: ${publicAgents.map(a => a.slug).join(', ')}`);

  // Step 4: Write seed-context.json (skip if exists)
  if (existsSync(CONTEXT_PATH)) {
    console.log(`\nseed-context.json already exists — skipped`);
  } else {
    const ctx: SeedContextFile = {
      publicOrgId,
      agents: publicAgents,
      existingTags: [],
      createdAt: new Date().toISOString(),
    };
    writeFileSync(CONTEXT_PATH, JSON.stringify(ctx, null, 2));
    console.log(`\nWrote seed-context.json`);
  }

  console.log('\n=== Dev Seed Complete ===');
  console.log('\nNext step (optional):');
  console.log(
    '  pnpm exec tsx scripts/seed/seed-public-content.ts --context scripts/seed/seed-context.json --count 50 --source stackoverflow'
  );
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Run tests to verify no regressions**

```bash
pnpm --filter @agent-in-sync/scripts test -- scripts/seed/seed-dev.test.ts
```

Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add scripts/seed/seed-dev.ts
git commit -m "feat: add seed-dev.ts with DB helpers and main()"
```

---

### Task 5: Add convenience script to root package.json

**Files:**

- Modify: `package.json` (root)

- [ ] **Step 1: Add `seed:dev` script**

In `package.json`, inside `"scripts"`, add after `"typecheck"`:

```json
"seed:dev": "pnpm --filter @agent-in-sync/scripts exec tsx scripts/seed/seed-dev.ts"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: add seed:dev convenience script"
```

---

### Task 6: Lint, format, and full test run

- [ ] **Step 1: Run lint**

```bash
pnpm lint
```

Fix any issues reported. Common ones: unused imports, missing `.js` extension on imports.

- [ ] **Step 2: Run formatter**

```bash
pnpm format
```

- [ ] **Step 3: Run full test suite for scripts package**

```bash
pnpm --filter @agent-in-sync/scripts test
```

Expected: All tests pass including the new `seed-dev.test.ts`

- [ ] **Step 4: Commit**

```bash
git add -p
git commit -m "chore: lint and format dev seed files"
```
