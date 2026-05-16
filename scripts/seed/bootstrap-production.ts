#!/usr/bin/env tsx

/**
 * Bootstraps seed agent personas on the PRODUCTION database and writes
 * a context file with all IDs needed for the local seed run.
 *
 * Run this ONCE against production before running the local seed pipeline.
 *
 * Usage:
 *   DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm exec tsx seed/bootstrap-production.ts
 *
 * Output:
 *   ./seed-context.json — contains publicOrgId, agent IDs, existing tag IDs
 */

import { writeFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  closeDb,
  users,
  organizations,
  organizationMembers,
  agents,
  tags,
} from '@agent-in-sync/db-client';
import { AGENT_PERSONAS } from './agents.js';

type SeedContextFile = {
  publicOrgId: string;
  agents: Array<{
    slug: string;
    displayName: string;
    bio: string;
    avatar: string;
    domainTags: string[];
    userId: string;
    agentId: string;
  }>;
  existingTags: Array<{ id: string; name: string }>;
  createdAt: string;
};

const OUTPUT_FILE = 'seed-context.json';

async function main(): Promise<void> {
  console.log('\n=== Bootstrap Seed Agents on Production ===\n');

  const db = getDb();

  // 1. Find the public org
  const [publicOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isPublic, true))
    .limit(1);

  if (!publicOrg) {
    console.error('No public organization found in database. Create one first.');
    await closeDb();
    process.exit(1);
  }

  console.log(`[DB] Public org: ${publicOrg.id}`);

  // 2. Bootstrap each agent persona
  const bootstrappedAgents: SeedContextFile['agents'] = [];

  for (const persona of AGENT_PERSONAS) {
    const email = `${persona.slug}@agentinsync.seed`;

    // Ensure user
    let userId: string;
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      userId = existingUser.id;
      console.log(`[Agent] ${persona.slug}: user exists (${userId})`);
    } else {
      const [created] = await db
        .insert(users)
        .values({ email, name: persona.displayName, emailVerified: true })
        .returning({ id: users.id });
      if (!created) throw new Error(`Failed to create user for ${persona.slug}`);
      userId = created.id;
      console.log(`[Agent] ${persona.slug}: created user (${userId})`);
    }

    // Ensure org membership
    const [existingMember] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, publicOrg.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (!existingMember) {
      await db.insert(organizationMembers).values({
        organizationId: publicOrg.id,
        userId,
        role: 'member',
      });
      console.log(`[Agent] ${persona.slug}: added to public org`);
    }

    // Ensure agent profile
    let agentId: string;
    const [existingAgent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, persona.slug))
      .limit(1);

    if (existingAgent) {
      agentId = existingAgent.id;
      console.log(`[Agent] ${persona.slug}: agent exists (${agentId})`);
    } else {
      const [created] = await db
        .insert(agents)
        .values({
          slug: persona.slug,
          displayName: persona.displayName,
          bio: persona.bio,
          avatarUrl: persona.avatar,
          createdByUserId: userId,
          organizationId: publicOrg.id,
          isPublic: true,
        })
        .returning({ id: agents.id });
      if (!created) throw new Error(`Failed to create agent for ${persona.slug}`);
      agentId = created.id;
      console.log(`[Agent] ${persona.slug}: created agent (${agentId})`);
    }

    bootstrappedAgents.push({
      ...persona,
      userId,
      agentId,
    });
  }

  // 3. Fetch all existing tags from production
  const existingTags = await db.select({ id: tags.id, name: tags.name }).from(tags);
  console.log(`\n[DB] Fetched ${existingTags.length} existing tags from production`);

  // 4. Write context file
  const context: SeedContextFile = {
    publicOrgId: publicOrg.id,
    agents: bootstrappedAgents,
    existingTags,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(context, null, 2));
  console.log(`\n[OK] Written ${OUTPUT_FILE}`);
  console.log(`     publicOrgId: ${context.publicOrgId}`);
  console.log(`     agents: ${context.agents.map(a => a.slug).join(', ')}`);
  console.log(`     existing tags: ${context.existingTags.length}`);
  console.log(`\nNext step: run the seed locally:`);
  console.log(
    `  ./seed/export-sql.sh --context seed-context.json --count 100 --source stackoverflow`
  );

  await closeDb();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
