#!/usr/bin/env tsx

/**
 * Re-indexes all solutions from the Public organization into Weaviate.
 * Run this after importing seed SQL data into a production database
 * that has Weaviate available.
 *
 * Usage:
 *   pnpm exec tsx seed/reindex-weaviate.ts
 *   pnpm exec tsx seed/reindex-weaviate.ts --batch-size 100
 *   pnpm exec tsx seed/reindex-weaviate.ts --force
 *
 * Required env vars:
 *   DATABASE_URL, WEAVIATE_URL
 */

import { eq, and, isNull } from 'drizzle-orm';
import {
  getDb,
  closeDb,
  issues,
  solutions,
  issueTags,
  tags,
  organizations,
  users,
  agents,
  apiKeys,
} from '@agent-in-sync/db-client';
import weaviate from 'weaviate-client';

const SOLUTION_COLLECTION = 'Solution';
const DEFAULT_BATCH_SIZE = 50;

const SEVERITY_ORDER_MAP: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

const COMPLEXITY_ORDER_MAP: Record<string, number> = {
  trivial: 1,
  simple: 2,
  medium: 3,
  complex: 4,
  'very-complex': 5,
};

function severityToOrder(severity: string | null | undefined): number {
  return severity ? (SEVERITY_ORDER_MAP[severity] ?? 5) : 5;
}

function complexityToOrder(complexity: string | null | undefined): number {
  return complexity ? (COMPLEXITY_ORDER_MAP[complexity] ?? 6) : 6;
}

function parseArgs(): { batchSize: number; force: boolean } {
  const args = process.argv.slice(2);
  let batchSize = DEFAULT_BATCH_SIZE;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--batch-size' && args[i + 1]) {
      batchSize = parseInt(args[i + 1]!, 10);
      if (isNaN(batchSize) || batchSize < 1) {
        console.error('--batch-size must be a positive integer');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--help') {
      console.log(`
Usage: pnpm exec tsx seed/reindex-weaviate.ts [options]

Options:
  --batch-size <n>  Solutions per batch (default: ${DEFAULT_BATCH_SIZE})
  --force           Re-index all solutions (deletes existing Weaviate objects first)
  --help            Show this help message

Re-indexes all solutions from the Public org into Weaviate.
Run after importing seed-data.sql into a database with Weaviate available.
`);
      process.exit(0);
    }
  }

  return { batchSize, force };
}

type PackageInfo = { name: string; version: string };

async function main(): Promise<void> {
  const { batchSize, force } = parseArgs();

  console.log('\n=== Weaviate Re-Index for Seed Data ===\n');
  if (force)
    console.log('[mode] --force: will delete existing Weaviate objects before re-inserting\n');

  const weaviateUrl = process.env.WEAVIATE_URL ?? 'http://localhost:8080';
  const dbUrl = process.env.DATABASE_URL ?? '';
  warnIfMismatch(dbUrl, weaviateUrl);

  const client = await weaviate.connectToLocal({
    host: new URL(weaviateUrl).hostname,
    port: Number(new URL(weaviateUrl).port),
  });
  console.log(`[Weaviate] Connected to ${weaviateUrl}`);

  const collection = client.collections.get(SOLUTION_COLLECTION);

  // Find the public org
  const db = getDb();
  const [publicOrg] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.isPublic, true))
    .limit(1);

  if (!publicOrg) {
    console.error('No public organization found. Run the seed script first.');
    process.exit(1);
  }

  console.log(`[DB] Public org: ${publicOrg.id} (${publicOrg.name})`);

  // Build the query with proper JOINs to get all metadata
  const whereClause = force
    ? eq(issues.organizationId, publicOrg.id)
    : and(eq(issues.organizationId, publicOrg.id), isNull(solutions.weaviateIndexedAt));

  const allSolutions = await db
    .select({
      solutionId: solutions.id,
      issueId: solutions.issueId,
      content: solutions.content,
      voteCount: solutions.voteCount,
      isAccepted: solutions.isAccepted,
      createdAt: solutions.createdAt,
      issueTitle: issues.title,
      issueOrgId: issues.organizationId,
      issueCreatedAt: issues.createdAt,
      // Issue metadata
      project: issues.project,
      techStack: issues.techStack,
      packages: issues.packages,
      errorType: issues.errorType,
      errorCategory: issues.errorCategory,
      severity: issues.severity,
      environment: issues.environment,
      fileTypes: issues.fileTypes,
      codePatterns: issues.codePatterns,
      affectedArea: issues.affectedArea,
      frequency: issues.frequency,
      hasMinimalRepro: issues.hasMinimalRepro,
      rootCause: issues.rootCause,
      fixType: issues.fixType,
      complexity: issues.complexity,
      relatedPatterns: issues.relatedPatterns,
      lessonsLearned: issues.lessonsLearned,
      // Author info
      authorName: users.name,
      agentSlug: agents.slug,
      agentDisplayName: agents.displayName,
      // Trust level from API key
      trustLevel: apiKeys.trustLevel,
    })
    .from(solutions)
    .innerJoin(issues, eq(solutions.issueId, issues.id))
    .innerJoin(users, eq(solutions.authorId, users.id))
    .leftJoin(agents, eq(solutions.authorAgentId, agents.id))
    .leftJoin(apiKeys, eq(solutions.authorApiKeyId, apiKeys.id))
    .where(whereClause);

  console.log(`[DB] Found ${allSolutions.length} solutions to index\n`);

  if (allSolutions.length === 0) {
    console.log('Nothing to index. All solutions already have weaviateIndexedAt set.');
    client.close();
    await closeDb();
    return;
  }

  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < allSolutions.length; i += batchSize) {
    const batch = allSolutions.slice(i, i + batchSize);

    for (const sol of batch) {
      try {
        // Fetch tags for this issue
        const issueTags_ = await db
          .select({ name: tags.name })
          .from(issueTags)
          .innerJoin(tags, eq(issueTags.tagId, tags.id))
          .where(eq(issueTags.issueId, sol.issueId));

        const tagNames = issueTags_.map(t => t.name);

        // Parse packages JSONB
        const pkgs = (sol.packages ?? []) as PackageInfo[];
        const packageNames = pkgs.map(p => p.name);
        const packageVersions = pkgs.map(p => `${p.name}@${p.version}`);

        // If --force, delete existing object first
        if (force) {
          try {
            const existing = await collection.query.fetchObjects({
              filters: collection.filter.byProperty('solutionId').equal(sol.solutionId),
              limit: 1,
            });
            for (const obj of existing.objects) {
              await collection.data.deleteById(obj.uuid);
            }
          } catch {
            // Ignore deletion errors
          }
        }

        await collection.data.insert({
          solutionId: sol.solutionId,
          issueId: sol.issueId,
          organizationId: sol.issueOrgId,
          title: sol.issueTitle,
          content: sol.content,
          tags: tagNames,
          voteCount: sol.voteCount,
          createdAt: sol.createdAt,
          issueCreatedAt: new Date(sol.issueCreatedAt),
          project: sol.project ?? null,
          techStack: sol.techStack ?? [],
          packageNames,
          packageVersions,
          errorType: sol.errorType ?? null,
          errorCategory: sol.errorCategory ?? null,
          severity: sol.severity ?? null,
          environment: sol.environment ?? null,
          fileTypes: sol.fileTypes ?? [],
          codePatterns: sol.codePatterns ?? [],
          affectedArea: sol.affectedArea ?? null,
          frequency: sol.frequency ?? null,
          hasMinimalRepro: sol.hasMinimalRepro ?? null,
          rootCause: sol.rootCause ?? null,
          fixType: sol.fixType ?? null,
          complexity: sol.complexity ?? null,
          relatedPatterns: sol.relatedPatterns ?? [],
          lessonsLearned: sol.lessonsLearned ?? [],
          authorName: sol.authorName ?? 'Unknown',
          agentSlug: sol.agentSlug ?? null,
          agentDisplayName: sol.agentDisplayName ?? null,
          organizationName: publicOrg.name,
          isAccepted: sol.isAccepted,
          authorTrustLevel: sol.trustLevel ?? 'new',
          severityOrder: severityToOrder(sol.severity),
          complexityOrder: complexityToOrder(sol.complexity),
        });

        // Mark as indexed
        await db
          .update(solutions)
          .set({ weaviateIndexedAt: new Date() })
          .where(eq(solutions.id, sol.solutionId));

        indexed++;
      } catch (err) {
        console.error(`  FAIL: solution ${sol.solutionId} - ${err}`);
        failed++;
      }
    }

    console.log(
      `  [${Math.min(i + batchSize, allSolutions.length)}/${allSolutions.length}] indexed: ${indexed}, failed: ${failed}`
    );
  }

  console.log(`\n=== Re-Index Complete ===`);
  console.log(`Indexed: ${indexed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Total:   ${allSolutions.length}`);

  client.close();
  await closeDb();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

function warnIfMismatch(dbUrl: string, weaviateUrl: string): void {
  const dbHost = safeHostname(dbUrl);
  const weaviateHost = safeHostname(weaviateUrl);
  const isDbRemote = dbHost !== '' && dbHost !== 'localhost' && dbHost !== '127.0.0.1';
  const isWeaviateLocal =
    weaviateHost === '' || weaviateHost === 'localhost' || weaviateHost === '127.0.0.1';

  if (isDbRemote && isWeaviateLocal) {
    console.warn(
      `\n⚠️  WARNING: DATABASE_URL points to a remote host (${dbHost}) but WEAVIATE_URL is localhost.` +
        `\n   This will index vectors locally instead of on the remote Weaviate instance.` +
        `\n   If this is intentional (SSH tunnel), ignore this warning.\n`
    );
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
