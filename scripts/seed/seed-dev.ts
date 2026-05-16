#!/usr/bin/env tsx

import { writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, and } from 'drizzle-orm';
import weaviate from 'weaviate-client';
import {
  getDb,
  getPool,
  users,
  organizations,
  organizationMembers,
  agents,
} from '@agent-in-sync/db-client';
import { ensurePublicOrg, bootstrapAgents, AGENT_PERSONAS } from './agents.js';
import type { SeedContextFile } from './types.js';
import { buildDevOrgs, buildDevUsers } from './seed-dev-data.js';
import type { DevOrg, DevUser } from './seed-dev-data.js';
import { clearSeedCache } from './seed-cache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXT_PATH = resolve(__dirname, 'seed-context.json');

function assertDevEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('ABORT: seed-dev refuses to run with NODE_ENV=production.');
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  let host = 'localhost';
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    // malformed or missing URL — default will be localhost, allow through
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!isLocal) {
    console.error(
      `ABORT: seed-dev refuses to truncate — DATABASE_URL points to "${host}", not localhost.`
    );
    console.error('This script is for local development only.');
    process.exit(1);
  }
}

async function clearWeaviateCollections(): Promise<void> {
  const host = process.env.WEAVIATE_URL ?? 'http://localhost:8080';
  const client = await weaviate.connectToLocal({
    host: new URL(host).hostname,
    port: Number(new URL(host).port),
  });
  try {
    for (const name of ['Solution', 'Issue']) {
      if (await client.collections.exists(name)) {
        await client.collections.delete(name);
        console.log(`[Weaviate] Deleted collection: ${name}`);
      }
    }
  } finally {
    client.close();
  }
}

async function truncateAllTables(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  if (rows.length === 0) return;
  const tableList = rows.map(r => `"${r.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
  console.log(`[Truncate] Cleared ${rows.length} tables`);
}

function backupContextFile(): void {
  if (!existsSync(CONTEXT_PATH)) return;
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, 'Z');
  const backupPath = resolve(__dirname, `seed-context-${timestamp}.json`);
  renameSync(CONTEXT_PATH, backupPath);
  console.log(`[Backup] seed-context.json → seed-context-${timestamp}.json`);
}

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

async function main(): Promise<void> {
  assertDevEnvironment();

  console.log('\n=== AgentInSync Dev Seed ===\n');

  // Step 1: Wipe Postgres, Weaviate, and seed cache so each run starts from a clean slate
  console.log('--- Truncating all tables ---');
  await truncateAllTables();
  console.log('--- Clearing Weaviate collections ---');
  await clearWeaviateCollections();
  clearSeedCache();
  console.log('[Cache] Cleared .seed-cache');

  const devOrgs = buildDevOrgs();
  const devUsers = buildDevUsers(devOrgs);

  // Step 2: Create fake orgs + users + memberships
  console.log('\n--- Creating fake organizations and users ---');
  const orgIds = new Map<string, string>();
  const adminUserIds = new Map<string, string>();

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

  // Step 3: Create 2 agents per fake org
  console.log('\n--- Creating agents for fake orgs ---');
  const agentPersonasForOrgs = AGENT_PERSONAS.slice(0, 2);
  for (const org of devOrgs) {
    const orgId = orgIds.get(org.slug)!;
    const adminUserId = adminUserIds.get(org.slug)!;
    for (const persona of agentPersonasForOrgs) {
      await ensureOrgAgent(persona, org.slug, orgId, adminUserId);
    }
  }

  // Step 4: Bootstrap Public org + agents (for seed-public-content.ts)
  console.log('\n--- Bootstrapping Public org and agents ---');
  const publicOrgId = await ensurePublicOrg();
  const publicAgents = await bootstrapAgents(publicOrgId);

  console.log(`\nPublic org: ${publicOrgId}`);
  console.log(`Public agents: ${publicAgents.map(a => a.slug).join(', ')}`);

  // Step 5: Back up any existing context file, then write fresh one with local IDs
  backupContextFile();
  const ctx: SeedContextFile = {
    publicOrgId,
    agents: publicAgents,
    existingTags: [],
    createdAt: new Date().toISOString(),
  };
  writeFileSync(CONTEXT_PATH, JSON.stringify(ctx, null, 2));
  console.log(`Wrote seed-context.json`);

  console.log('\n=== Dev Seed Complete ===');
  console.log('\nNext step (optional):');
  console.log(
    '  pnpm exec tsx scripts/seed/seed-public-content.ts --context scripts/seed/seed-context.json --count 50 --source stackoverflow'
  );
}

main()
  .then(async () => {
    await getPool().end();
    process.exit(0);
  })
  .catch(async err => {
    console.error('Fatal error:', err);
    try {
      await getPool().end();
    } catch {
      // pool may already be closed
    }
    process.exit(1);
  });
