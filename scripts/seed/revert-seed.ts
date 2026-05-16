#!/usr/bin/env tsx

/**
 * Reverts seeded content from the Public organization within a date range.
 * Deletes issues (and their solutions, votes, comments, tags via CASCADE)
 * that were created by seed agents and match the sourceType in customMetadata.
 * Also removes corresponding solutions from Weaviate.
 *
 * Usage:
 *   pnpm exec tsx --env-file=seed/.env seed/revert-seed.ts --from 2026-02-01 --to 2026-02-18
 *   pnpm exec tsx --env-file=seed/.env seed/revert-seed.ts --from 2026-02-01 --to 2026-02-18 --dry-run
 *
 * Required env vars:
 *   DATABASE_URL
 * Optional:
 *   WEAVIATE_URL (for vector index cleanup)
 */

import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { getDb, closeDb, issues, solutions, organizations, agents } from '@agent-in-sync/db-client';
import weaviate from 'weaviate-client';
import type { WeaviateClient } from 'weaviate-client';
import { AGENT_PERSONAS } from './agents.js';

const SOLUTION_COLLECTION = 'Solution';

function parseArgs(): { from: Date; to: Date; dryRun: boolean; batchSize: number } {
  const args = process.argv.slice(2);
  let from: Date | null = null;
  let to: Date | null = null;
  let dryRun = false;
  let batchSize = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = new Date(args[i + 1]!);
      if (isNaN(from.getTime())) {
        console.error('--from must be a valid date (e.g. 2026-02-01)');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      to = new Date(args[i + 1]!);
      if (isNaN(to.getTime())) {
        console.error('--to must be a valid date (e.g. 2026-02-18)');
        process.exit(1);
      }
      // Include the full "to" day
      to.setHours(23, 59, 59, 999);
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      batchSize = parseInt(args[i + 1]!, 10);
      i++;
    } else if (args[i] === '--help') {
      console.log(`
Usage: pnpm exec tsx --env-file=seed/.env seed/revert-seed.ts [options]

Options:
  --from <date>         Start date inclusive (required, e.g. 2026-02-01)
  --to <date>           End date inclusive (required, e.g. 2026-02-18)
  --dry-run             Preview what would be deleted without actually deleting
  --batch-size <n>      Issues per deletion batch (default: 100)
  --help                Show this help message

Deletes all seed-created issues (and cascading solutions, votes, comments, tags)
from the Public org within the specified date range. Also cleans up Weaviate.
`);
      process.exit(0);
    }
  }

  if (!from || !to) {
    console.error('Both --from and --to are required. Use --help for usage.');
    process.exit(1);
  }

  return { from, to, dryRun, batchSize };
}

async function connectWeaviate(): Promise<WeaviateClient | null> {
  try {
    const host = process.env.WEAVIATE_URL ?? 'http://localhost:8080';
    const client = await weaviate.connectToLocal({
      host: new URL(host).hostname,
      port: Number(new URL(host).port),
    });
    console.log(`[Weaviate] Connected to ${host}`);
    return client;
  } catch {
    console.warn('[Weaviate] Connection failed — skipping vector index cleanup');
    return null;
  }
}

async function main(): Promise<void> {
  const { from, to, dryRun, batchSize } = parseArgs();

  console.log(`\n=== Revert Seed Content ===`);
  console.log(`Range: ${from.toISOString()} → ${to.toISOString()}`);
  console.log(`Mode:  ${dryRun ? 'DRY RUN (no changes)' : 'LIVE — will delete data'}\n`);

  const db = getDb();

  // Find public org
  const [publicOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.isPublic, true))
    .limit(1);

  if (!publicOrg) {
    console.error('No public organization found.');
    await closeDb();
    process.exit(1);
  }

  // Find seed agent IDs
  const seedSlugs = AGENT_PERSONAS.map(p => p.slug);
  const seedAgents = await db
    .select({ id: agents.id, slug: agents.slug })
    .from(agents)
    .where(inArray(agents.slug, seedSlugs));

  if (seedAgents.length === 0) {
    console.log('No seed agents found in database. Nothing to revert.');
    await closeDb();
    return;
  }

  const seedAgentIds = seedAgents.map(a => a.id);
  console.log(`[DB] Public org: ${publicOrg.id}`);
  console.log(`[DB] Seed agents: ${seedAgents.map(a => a.slug).join(', ')}\n`);

  // Find matching issues
  const matchingIssues = await db
    .select({
      id: issues.id,
      title: issues.title,
      createdAt: issues.createdAt,
    })
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, publicOrg.id),
        inArray(issues.authorAgentId, seedAgentIds),
        gte(issues.createdAt, from),
        lte(issues.createdAt, to)
      )
    );

  console.log(`Found ${matchingIssues.length} seed issues in date range.\n`);

  if (matchingIssues.length === 0) {
    console.log('Nothing to delete.');
    await closeDb();
    return;
  }

  // Count related records
  const issueIds = matchingIssues.map(i => i.id);

  const [solutionCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(solutions)
    .where(inArray(solutions.issueId, issueIds));

  console.log(`Related records that will be cascade-deleted:`);
  console.log(`  Issues:    ${matchingIssues.length}`);
  console.log(`  Solutions: ${solutionCount?.count ?? 0} (+ their votes and comments)\n`);

  if (dryRun) {
    console.log('--- DRY RUN — showing first 10 issues ---');
    for (const issue of matchingIssues.slice(0, 10)) {
      console.log(`  [${issue.createdAt?.toISOString()}] "${issue.title?.slice(0, 70)}..."`);
    }
    if (matchingIssues.length > 10) {
      console.log(`  ... and ${matchingIssues.length - 10} more`);
    }
    console.log('\nRe-run without --dry-run to delete.');
    await closeDb();
    return;
  }

  // Collect solution IDs for Weaviate cleanup before deleting from DB
  const solutionIds = await db
    .select({ id: solutions.id })
    .from(solutions)
    .where(inArray(solutions.issueId, issueIds));

  // Delete issues in batches (cascades to solutions, votes, comments, issue_tags)
  let deleted = 0;
  for (let i = 0; i < issueIds.length; i += batchSize) {
    const batch = issueIds.slice(i, i + batchSize);

    // Clear acceptedSolutionId first to avoid FK issues during cascade
    await db.update(issues).set({ acceptedSolutionId: null }).where(inArray(issues.id, batch));

    const result = await db.delete(issues).where(inArray(issues.id, batch));
    const batchDeleted = result.rowCount ?? batch.length;
    deleted += batchDeleted;

    console.log(`  Deleted ${deleted}/${matchingIssues.length} issues...`);
  }

  // Clean up Weaviate
  const weaviateClient = await connectWeaviate();
  if (weaviateClient && solutionIds.length > 0) {
    console.log(`\n[Weaviate] Removing ${solutionIds.length} solutions from vector index...`);
    const collection = weaviateClient.collections.get(SOLUTION_COLLECTION);
    let weaviateDeleted = 0;
    let weaviateFailed = 0;

    for (const sol of solutionIds) {
      try {
        await collection.data.deleteMany(collection.filter.byProperty('solutionId').equal(sol.id));
        weaviateDeleted++;
      } catch {
        weaviateFailed++;
      }
    }

    console.log(`[Weaviate] Deleted: ${weaviateDeleted}, Failed: ${weaviateFailed}`);
    weaviateClient.close();
  }

  console.log(`\n=== Revert Complete ===`);
  console.log(`Deleted: ${deleted} issues (+ cascaded solutions, votes, comments, tags)`);

  await closeDb();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
