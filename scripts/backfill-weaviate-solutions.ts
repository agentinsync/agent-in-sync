/**
 * Backfill Weaviate Solution collection with all solutions from PostgreSQL.
 *
 * Run after deploying the v4 schema upgrade (which drops and recreates the collection).
 * This re-indexes every approved solution with display and sort-order fields.
 *
 * Usage:
 *   npx tsx scripts/backfill-weaviate-solutions.ts
 *
 * Env vars:
 *   DATABASE_URL   — PostgreSQL connection string (defaults to local dev)
 *   WEAVIATE_URL   — Weaviate HTTP URL (defaults to http://localhost:8080)
 *   BATCH_SIZE     — Number of solutions per batch (default 50)
 */

import { eq, isNull, and, sql } from 'drizzle-orm';
import {
  getDb,
  closeDb,
  solutions,
  issues,
  users,
  organizations,
  apiKeys,
  agents,
  issueTags,
  tags,
} from '@agent-in-sync/db-client';
import weaviate from 'weaviate-client';

const SOLUTION_COLLECTION = 'Solution';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? '50', 10);

const SEVERITY_ORDER_MAP: Record<string, number> = { critical: 1, high: 2, medium: 3, low: 4 };
const COMPLEXITY_ORDER_MAP: Record<string, number> = {
  trivial: 1,
  simple: 2,
  medium: 3,
  complex: 4,
  'very-complex': 5,
};

function severityToOrder(severity: string | null): number {
  return severity ? (SEVERITY_ORDER_MAP[severity] ?? 5) : 5;
}

function complexityToOrder(complexity: string | null): number {
  return complexity ? (COMPLEXITY_ORDER_MAP[complexity] ?? 6) : 6;
}

async function main() {
  const db = getDb();

  const host = process.env.WEAVIATE_URL ?? 'http://localhost:8080';
  const weaviateClient = await weaviate.connectToLocal({
    host: new URL(host).hostname,
    port: Number(new URL(host).port),
  });

  const collectionExists = await weaviateClient.collections.exists(SOLUTION_COLLECTION);
  if (!collectionExists) {
    console.error(
      `Collection "${SOLUTION_COLLECTION}" does not exist. Start the backend first to create the schema.`
    );
    process.exit(1);
  }

  const collection = weaviateClient.collections.get(SOLUTION_COLLECTION);

  const allSolutions = await db
    .select({
      solutionId: solutions.id,
      issueId: solutions.issueId,
      content: solutions.content,
      voteCount: solutions.voteCount,
      isAccepted: solutions.isAccepted,
      createdAt: solutions.createdAt,
      authorId: solutions.authorId,
      authorApiKeyId: solutions.authorApiKeyId,
      authorAgentId: solutions.authorAgentId,

      title: issues.title,
      organizationId: issues.organizationId,
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

      authorName: users.name,
      organizationName: organizations.name,
      trustLevel: apiKeys.trustLevel,
      agentSlug: agents.slug,
      agentDisplayName: agents.displayName,
    })
    .from(solutions)
    .innerJoin(issues, eq(solutions.issueId, issues.id))
    .innerJoin(users, eq(solutions.authorId, users.id))
    .innerJoin(organizations, eq(issues.organizationId, organizations.id))
    .leftJoin(apiKeys, eq(solutions.authorApiKeyId, apiKeys.id))
    .leftJoin(agents, eq(solutions.authorAgentId, agents.id))
    .where(and(eq(solutions.status, 'approved'), isNull(solutions.deletedAt)));

  console.log(`Found ${allSolutions.length} solutions to index`);

  const tagsByIssue = new Map<string, string[]>();
  if (allSolutions.length > 0) {
    const issueIds = Array.from(new Set(allSolutions.map(s => s.issueId)));
    const allIssueTags = await db
      .select({ issueId: issueTags.issueId, tagName: tags.name })
      .from(issueTags)
      .innerJoin(tags, eq(issueTags.tagId, tags.id));

    for (const row of allIssueTags) {
      if (!issueIds.includes(row.issueId)) continue;
      const arr = tagsByIssue.get(row.issueId) ?? [];
      arr.push(row.tagName);
      tagsByIssue.set(row.issueId, arr);
    }
  }

  let indexed = 0;
  let errors = 0;

  for (let i = 0; i < allSolutions.length; i += BATCH_SIZE) {
    const batch = allSolutions.slice(i, i + BATCH_SIZE);

    for (const sol of batch) {
      try {
        const pkgs = (sol.packages ?? []) as Array<{ name: string; version: string }>;
        const packageNames = pkgs.map(p => p.name);
        const packageVersions = pkgs.map(p => `${p.name}@${p.version}`);
        for (const pkg of pkgs) {
          const majorVersion = pkg.version.split('.')[0];
          packageVersions.push(`${pkg.name}@${majorVersion}`);
        }

        const tagNames = tagsByIssue.get(sol.issueId) ?? [];

        await collection.data.insert({
          solutionId: sol.solutionId,
          issueId: sol.issueId,
          organizationId: sol.organizationId,
          title: sol.title,
          content: sol.content,
          tags: tagNames,
          voteCount: sol.voteCount,
          createdAt: sol.createdAt,
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
          organizationName: sol.organizationName ?? 'Unknown',
          isAccepted: sol.isAccepted,
          authorTrustLevel: sol.trustLevel ?? 'new',
          severityOrder: severityToOrder(sol.severity),
          complexityOrder: complexityToOrder(sol.complexity),
        });

        await db.execute(
          sql`UPDATE solutions SET weaviate_indexed_at = NOW() WHERE id = ${sol.solutionId}`
        );

        indexed++;
      } catch (err) {
        errors++;
        console.error(`Failed to index solution ${sol.solutionId}:`, err);
      }
    }

    console.log(
      `Progress: ${Math.min(i + BATCH_SIZE, allSolutions.length)}/${allSolutions.length} (${indexed} indexed, ${errors} errors)`
    );
  }

  console.log(`\nDone. Indexed: ${indexed}, Errors: ${errors}, Total: ${allSolutions.length}`);

  weaviateClient.close();
  await closeDb();
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
