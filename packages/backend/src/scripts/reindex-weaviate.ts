/**
 * Bulk re-index all approved solutions from PostgreSQL into Weaviate.
 *
 * Run after a Weaviate schema version bump that drops the collection.
 * Reads weaviateIndexedAt to skip already-indexed solutions (resume-safe).
 *
 * Usage:
 *   DATABASE_URL=... WEAVIATE_URL=... tsx src/scripts/reindex-weaviate.ts
 *   DATABASE_URL=... WEAVIATE_URL=... tsx src/scripts/reindex-weaviate.ts --force
 *
 * --force  Re-index all solutions regardless of weaviateIndexedAt.
 */

import 'dotenv/config';
import {
  getDb,
  solutions,
  issues,
  issueTags,
  tags,
  users,
  organizations,
  apiKeys,
  agents,
} from '@agent-in-sync/db-client';
import { eq, isNull, and, sql } from 'drizzle-orm';
import {
  getWeaviateClient,
  closeWeaviateClient,
  SOLUTION_COLLECTION,
  type SolutionVector,
  severityToOrder,
  complexityToOrder,
} from '../weaviate/index.js';

const BATCH_SIZE = 50;
const force = process.argv.includes('--force');

async function main() {
  const db = getDb();
  const weaviateClient = await getWeaviateClient();
  const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(solutions)
    .where(and(eq(solutions.status, 'approved'), isNull(solutions.deletedAt)));
  const total = countRow?.count ?? 0;
  console.log(`Found ${total} approved solutions to index`);

  let offset = 0;
  let indexed = 0;
  let skipped = 0;

  while (offset < total) {
    const rows = await db
      .select({
        solutionId: solutions.id,
        solutionContent: solutions.content,
        solutionVoteCount: solutions.voteCount,
        solutionIsAccepted: solutions.isAccepted,
        solutionCreatedAt: solutions.createdAt,
        weaviateIndexedAt: solutions.weaviateIndexedAt,
        authorId: solutions.authorId,
        authorApiKeyId: solutions.authorApiKeyId,
        authorAgentId: solutions.authorAgentId,
        issueId: issues.id,
        issueTitle: issues.title,
        issueCreatedAt: issues.createdAt,
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
        lessonsLearned: issues.lessonsLearned,
        relatedPatterns: issues.relatedPatterns,
      })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .where(and(eq(solutions.status, 'approved'), isNull(solutions.deletedAt)))
      .limit(BATCH_SIZE)
      .offset(offset);

    for (const row of rows) {
      if (!force && row.weaviateIndexedAt) {
        skipped++;
        continue;
      }

      // Fetch tags for this issue
      const tagRows = await db
        .select({ name: tags.name })
        .from(issueTags)
        .innerJoin(tags, eq(issueTags.tagId, tags.id))
        .where(eq(issueTags.issueId, row.issueId));
      const tagNames = tagRows.map((t: { name: string }) => t.name);

      // Fetch display fields
      const [[userRow], [orgRow], agentRow, apiKeyRow] = await Promise.all([
        db.select({ name: users.name }).from(users).where(eq(users.id, row.authorId)).limit(1),
        db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, row.organizationId))
          .limit(1),
        row.authorAgentId
          ? db
              .select({ slug: agents.slug, displayName: agents.displayName })
              .from(agents)
              .where(eq(agents.id, row.authorAgentId))
              .limit(1)
              .then((rows: { slug: string | null; displayName: string | null }[]) => rows[0])
          : Promise.resolve(undefined),
        row.authorApiKeyId
          ? db
              .select({ trustLevel: apiKeys.trustLevel })
              .from(apiKeys)
              .where(eq(apiKeys.id, row.authorApiKeyId))
              .limit(1)
              .then((rows: { trustLevel: string }[]) => rows[0])
          : Promise.resolve(undefined),
      ]);

      type PkgInfo = { name: string; version: string };
      const pkgs: PkgInfo[] = (row.packages as PkgInfo[] | null) ?? [];
      const packageNames = pkgs.map(p => p.name);
      const packageVersions = pkgs.flatMap(p => [
        `${p.name}@${p.version}`,
        `${p.name}@${p.version.split('.')[0]}`,
      ]);

      try {
        await collection.data.insert({
          solutionId: row.solutionId,
          issueId: row.issueId,
          organizationId: row.organizationId,
          title: row.issueTitle,
          content: row.solutionContent,
          tags: tagNames,
          voteCount: row.solutionVoteCount,
          createdAt: row.solutionCreatedAt,
          issueCreatedAt: new Date(row.issueCreatedAt),
          project: row.project ?? null,
          techStack: row.techStack ?? [],
          packageNames,
          packageVersions,
          errorType: row.errorType ?? null,
          errorCategory: row.errorCategory ?? null,
          severity: row.severity ?? null,
          environment: row.environment ?? null,
          fileTypes: row.fileTypes ?? [],
          codePatterns: row.codePatterns ?? [],
          affectedArea: row.affectedArea ?? null,
          frequency: row.frequency ?? null,
          hasMinimalRepro: row.hasMinimalRepro ?? null,
          rootCause: row.rootCause ?? null,
          fixType: row.fixType ?? null,
          complexity: row.complexity ?? null,
          relatedPatterns: row.relatedPatterns ?? [],
          lessonsLearned: row.lessonsLearned ?? [],
          severityOrder: severityToOrder(row.severity),
          complexityOrder: complexityToOrder(row.complexity),
          authorName: userRow?.name ?? 'Unknown',
          agentSlug: agentRow?.slug ?? null,
          agentDisplayName: agentRow?.displayName ?? null,
          organizationName: orgRow?.name ?? 'Unknown',
          isAccepted: row.solutionIsAccepted,
          authorTrustLevel: apiKeyRow?.trustLevel ?? 'new',
        });

        await db
          .update(solutions)
          .set({ weaviateIndexedAt: new Date() })
          .where(eq(solutions.id, row.solutionId));

        indexed++;
      } catch (err) {
        console.error(`Failed to index solution ${row.solutionId}:`, err);
      }
    }

    offset += BATCH_SIZE;
    console.log(
      `Progress: ${Math.min(offset, total)}/${total} processed (${indexed} indexed, ${skipped} skipped)`
    );
  }

  console.log(`\nDone. Indexed: ${indexed}, Skipped (already indexed): ${skipped}`);
  await closeWeaviateClient();
  process.exit(0);
}

main().catch(err => {
  console.error('Re-index failed:', err);
  process.exit(1);
});
