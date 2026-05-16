import { eq, and, sql, inArray } from 'drizzle-orm';
import {
  getDb,
  withTransaction,
  closeDb,
  issues,
  solutions,
  tags,
  issueTags,
  votes,
  comments,
  users,
  agents,
  organizations,
} from '@agent-in-sync/db-client';
import weaviate, { vectorizer, configure, tokenization } from 'weaviate-client';
import type { WeaviateClient } from 'weaviate-client';
import { addToSeedCache } from './seed-cache.js';
import type { ProcessedItem, BootstrappedAgent, SeedContextFile } from './types.js';

const SOLUTION_COLLECTION = 'Solution';
const ISSUE_COLLECTION = 'Issue';
const SOLUTION_SCHEMA_VERSION = 7;
const ISSUE_SCHEMA_VERSION = 1;

type SeedContext = {
  publicOrgId: string;
  agents: BootstrappedAgent[];
  weaviateClient: WeaviateClient | null;
};

/** Pre-populate local DB with production tags so FKs match on import. */
export async function prePopulateTags(
  existingTags: SeedContextFile['existingTags']
): Promise<void> {
  if (existingTags.length === 0) return;

  const db = getDb();
  const CHUNK = 100;
  let inserted = 0;

  for (let i = 0; i < existingTags.length; i += CHUNK) {
    const chunk = existingTags.slice(i, i + CHUNK);
    await db
      .insert(tags)
      .values(chunk.map(t => ({ id: t.id, name: t.name, usageCount: 0 })))
      .onConflictDoNothing();
    inserted += chunk.length;
  }

  console.log(`[DB] Pre-populated ${inserted} production tags into local DB`);
}

/** Release DB pool to avoid stale connections during long non-DB phases. */
export async function releasePool(): Promise<void> {
  await closeDb();
}

/** Initialize seed context: connect to Weaviate and ensure schema exists. */
export async function initContext(
  publicOrgId: string,
  agents: BootstrappedAgent[]
): Promise<SeedContext> {
  const weaviateClient = await connectWeaviate();
  if (weaviateClient) {
    await ensureWeaviateSchema(weaviateClient);
  }
  return { publicOrgId, agents, weaviateClient };
}

/** Load all sourceIds already imported for this org (single query, in-memory set). */
export async function loadExistingSourceIds(publicOrgId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ sourceId: sql<string>`${issues.customMetadata}->>'sourceId'` })
    .from(issues)
    .where(
      and(
        eq(issues.organizationId, publicOrgId),
        sql`${issues.customMetadata}->>'sourceId' IS NOT NULL`
      )
    );

  return new Set(rows.map(r => r.sourceId).filter(Boolean));
}

/** Insert a batch of processed items into the database with full activity. */
export async function insertBatch(
  ctx: SeedContext,
  existingSourceIds: Set<string>,
  items: ProcessedItem[],
  startIndex: number,
  totalCount: number
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const globalIdx = startIndex + i;
    const sourceId = item.assigned.raw.sourceId;

    if (existingSourceIds.has(sourceId)) {
      console.log(
        `  [${globalIdx + 1}/${totalCount}] SKIP (exists): "${item.rewrittenTitle.slice(0, 60)}..."`
      );
      continue;
    }

    try {
      await insertSingleItem(ctx, item);
      existingSourceIds.add(sourceId);
      addToSeedCache(sourceId);
      inserted++;

      const mode = item.assigned.selfSolved ? 'self' : 'cross';
      const voteStr =
        item.assigned.voterAgents.length > 0 ? ` +${item.assigned.voterAgents.length}v` : '';
      const commentStr = item.validatorComment ? ' +comment' : '';
      const acceptStr = item.accepted ? ' [accepted]' : '';

      console.log(
        `  [${globalIdx + 1}/${totalCount}] ${mode}${voteStr}${commentStr}${acceptStr}: "${item.rewrittenTitle.slice(0, 55)}..."`
      );
    } catch (err) {
      console.error(
        `  [${globalIdx + 1}/${totalCount}] ERROR: "${item.rewrittenTitle.slice(0, 40)}..." - ${err}`
      );
    }
  }

  return inserted;
}

async function insertSingleItem(ctx: SeedContext, item: ProcessedItem): Promise<void> {
  const { assigned, rewrittenTitle, rewrittenDescription, solution, validatorComment, metadata } =
    item;
  const tagIds = await ensureTagsExist(assigned.raw.tags);

  const result = await withTransaction(async tx => {
    // 1. Insert issue
    const [createdIssue] = await tx
      .insert(issues)
      .values({
        organizationId: ctx.publicOrgId,
        authorId: assigned.issueAgent.userId,
        authorAgentId: assigned.issueAgent.agentId,
        title: rewrittenTitle,
        description: rewrittenDescription,
        solutionCount: solution ? 1 : 0,
        createdAt: item.timestamps.issue,
        updatedAt: item.timestamps.issue,
        errorType: metadata.errorType as any,
        severity: metadata.severity as any,
        environment: metadata.environment as any,
        complexity: metadata.complexity as any,
        affectedArea: metadata.affectedArea as any,
        rootCause: metadata.rootCause as any,
        fixType: metadata.fixType as any,
        frequency: metadata.frequency as any,
        techStack: metadata.techStack.length > 0 ? metadata.techStack : undefined,
        customMetadata: {
          sourceType: assigned.raw.sourceType,
          sourceId: assigned.raw.sourceId,
          sourceUrl: assigned.raw.sourceUrl,
          originalVotes: String(assigned.raw.votes),
        },
      })
      .returning({ id: issues.id });

    if (!createdIssue) throw new Error('Failed to insert issue');

    // 2. Insert issue tags
    if (tagIds.length > 0) {
      await tx.insert(issueTags).values(tagIds.map(tagId => ({ issueId: createdIssue.id, tagId })));
    }

    let solutionId: string | undefined;

    if (solution) {
      // 3. Insert solution
      const voteCount = assigned.voterAgents.length;
      const commentCount = validatorComment ? 1 : 0;

      const [createdSolution] = await tx
        .insert(solutions)
        .values({
          issueId: createdIssue.id,
          authorId: assigned.solverAgent.userId,
          authorAgentId: assigned.solverAgent.agentId,
          content: solution,
          voteCount,
          commentCount,
          isAccepted: item.accepted,
          createdAt: item.timestamps.solution,
          updatedAt: item.timestamps.solution,
        })
        .returning({ id: solutions.id });

      if (createdSolution) {
        solutionId = createdSolution.id;

        // 4. Insert votes
        if (assigned.voterAgents.length > 0) {
          await tx.insert(votes).values(
            assigned.voterAgents.map((voter, vi) => ({
              solutionId: createdSolution.id,
              userId: voter.userId,
              agentId: voter.agentId,
              direction: 'up' as const,
              createdAt: item.timestamps.votes[vi] ?? item.timestamps.solution,
            }))
          );
        }

        // 5. Insert comment
        if (validatorComment && assigned.commenterAgent) {
          await tx.insert(comments).values({
            solutionId: createdSolution.id,
            authorId: assigned.commenterAgent.userId,
            authorAgentId: assigned.commenterAgent.agentId,
            content: validatorComment,
            createdAt: item.timestamps.comment ?? item.timestamps.solution,
            updatedAt: item.timestamps.comment ?? item.timestamps.solution,
          });
        }

        // 7. Accept solution
        if (item.accepted) {
          await tx
            .update(issues)
            .set({ acceptedSolutionId: createdSolution.id })
            .where(eq(issues.id, createdIssue.id));
        }
      }
    }

    return { issueId: createdIssue.id, solutionId };
  });

  // 8. Index in Weaviate
  await indexIssueInWeaviate(
    ctx,
    result.issueId,
    rewrittenTitle,
    rewrittenDescription,
    assigned.raw.tags,
    metadata
  );

  if (result.solutionId && solution) {
    const db = getDb();
    const solverAgent = assigned.solverAgent;

    const [[userRow], [orgRow], agentRow] = await Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, solverAgent.userId)).limit(1),
      db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, ctx.publicOrgId))
        .limit(1),
      db
        .select({ slug: agents.slug, displayName: agents.displayName })
        .from(agents)
        .where(eq(agents.id, solverAgent.agentId))
        .limit(1)
        .then(rows => rows[0]),
    ]);

    await indexSolutionInWeaviate(
      ctx,
      result.solutionId,
      result.issueId,
      rewrittenTitle,
      solution,
      assigned.raw.tags,
      assigned.voterAgents.length,
      metadata,
      {
        authorName: userRow?.name ?? 'Unknown',
        agentSlug: agentRow?.slug ?? null,
        agentDisplayName: agentRow?.displayName ?? null,
        organizationName: orgRow?.name ?? 'Unknown',
        isAccepted: item.accepted,
        authorTrustLevel: 'new',
        issueCreatedAt: item.timestamps.issue,
      }
    );
  }
}

async function ensureTagsExist(tagNames: string[]): Promise<string[]> {
  const db = getDb();
  const normalized = [...new Set(tagNames.map(t => t.toLowerCase().trim()).filter(Boolean))];

  if (normalized.length === 0) return [];

  const existing = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, normalized));

  const existingNames = new Set(existing.map(t => t.name));
  const newNames = normalized.filter(n => !existingNames.has(n));

  if (newNames.length > 0) {
    await db.insert(tags).values(newNames.map(name => ({ name, usageCount: 1 })));
  }

  if (existing.length > 0) {
    await db
      .update(tags)
      .set({ usageCount: sql`${tags.usageCount} + 1` })
      .where(
        inArray(
          tags.id,
          existing.map(t => t.id)
        )
      );
  }

  const allTags = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, normalized));

  return allTags.map(t => t.id);
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
  } catch (err) {
    console.warn(`[Weaviate] Connection failed, skipping vector indexing: ${err}`);
    return null;
  }
}

async function ensureWeaviateSchema(client: WeaviateClient): Promise<void> {
  const solutionExists = await client.collections.exists(SOLUTION_COLLECTION);

  if (solutionExists) {
    const existing = client.collections.get(SOLUTION_COLLECTION);
    const config = await existing.config.get();
    const versionMatch = (config.description ?? '').match(/schema v(\d+)/);
    const existingVersion = versionMatch ? parseInt(versionMatch[1] ?? '0', 10) : 0;
    if (existingVersion < SOLUTION_SCHEMA_VERSION) {
      await client.collections.delete(SOLUTION_COLLECTION);
    }
  }

  if (!(await client.collections.exists(SOLUTION_COLLECTION))) {
    await client.collections.create({
      name: SOLUTION_COLLECTION,
      description: `Code solutions for issues (schema v${SOLUTION_SCHEMA_VERSION})`,
      vectorizers: [
        vectorizer.text2VecTransformers({
          name: 'titleVec',
          sourceProperties: ['title'],
          vectorizeCollectionName: false,
          vectorIndexConfig: configure.vectorIndex.hnsw({
            efConstruction: 256,
            maxConnections: 32,
          }),
        }),
        vectorizer.text2VecTransformers({
          name: 'summaryVec',
          sourceProperties: ['content'],
          vectorizeCollectionName: false,
          vectorIndexConfig: configure.vectorIndex.hnsw({
            efConstruction: 256,
            maxConnections: 32,
          }),
        }),
      ],
      reranker: configure.reranker.transformers(),
      properties: [
        { name: 'solutionId', dataType: 'text', skipVectorization: true },
        { name: 'issueId', dataType: 'text', skipVectorization: true },
        {
          name: 'organizationId',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'title', dataType: 'text', skipVectorization: true },
        { name: 'content', dataType: 'text', skipVectorization: true },
        { name: 'tags', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'voteCount', dataType: 'int', skipVectorization: true },
        { name: 'createdAt', dataType: 'date', skipVectorization: true },
        { name: 'project', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'techStack', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        {
          name: 'packageNames',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        {
          name: 'packageVersions',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'errorType', dataType: 'text', skipVectorization: true, indexFilterable: true },
        {
          name: 'errorCategory',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
          tokenization: tokenization.TRIGRAM,
        },
        { name: 'severity', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'environment', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'fileTypes', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        {
          name: 'codePatterns',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'affectedArea', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'frequency', dataType: 'text', skipVectorization: true, indexFilterable: true },
        {
          name: 'hasMinimalRepro',
          dataType: 'boolean',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'rootCause', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'fixType', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'complexity', dataType: 'text', skipVectorization: true, indexFilterable: true },
        {
          name: 'relatedPatterns',
          dataType: 'text[]',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'lessonsLearned', dataType: 'text[]', skipVectorization: true },
        { name: 'authorName', dataType: 'text', skipVectorization: true },
        { name: 'agentSlug', dataType: 'text', skipVectorization: true },
        { name: 'agentDisplayName', dataType: 'text', skipVectorization: true },
        { name: 'organizationName', dataType: 'text', skipVectorization: true },
        { name: 'isAccepted', dataType: 'boolean', skipVectorization: true },
        { name: 'authorTrustLevel', dataType: 'text', skipVectorization: true },
        { name: 'severityOrder', dataType: 'int', skipVectorization: true, indexFilterable: true },
        {
          name: 'complexityOrder',
          dataType: 'int',
          skipVectorization: true,
          indexFilterable: true,
        },
      ],
    });
    console.log(
      `[Weaviate] Created collection: ${SOLUTION_COLLECTION} (v${SOLUTION_SCHEMA_VERSION})`
    );
  }

  if (!(await client.collections.exists(ISSUE_COLLECTION))) {
    await client.collections.create({
      name: ISSUE_COLLECTION,
      description: `Issues for duplicate detection (schema v${ISSUE_SCHEMA_VERSION})`,
      vectorizers: vectorizer.text2VecTransformers({ vectorizeCollectionName: false }),
      properties: [
        { name: 'issueId', dataType: 'text', skipVectorization: true },
        {
          name: 'organizationId',
          dataType: 'text',
          skipVectorization: true,
          indexFilterable: true,
        },
        { name: 'title', dataType: 'text' },
        { name: 'description', dataType: 'text' },
        { name: 'tags', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'solutionCount', dataType: 'int', skipVectorization: true },
        { name: 'createdAt', dataType: 'date', skipVectorization: true },
        { name: 'project', dataType: 'text', skipVectorization: true, indexFilterable: true },
        { name: 'techStack', dataType: 'text[]', skipVectorization: true, indexFilterable: true },
        { name: 'errorType', dataType: 'text', skipVectorization: true, indexFilterable: true },
      ],
    });
    console.log(`[Weaviate] Created collection: ${ISSUE_COLLECTION} (v${ISSUE_SCHEMA_VERSION})`);
  }
}

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

type SolutionDisplayFields = {
  authorName: string;
  agentSlug: string | null;
  agentDisplayName: string | null;
  organizationName: string;
  isAccepted: boolean;
  authorTrustLevel: string;
  issueCreatedAt: Date;
};

async function indexSolutionInWeaviate(
  ctx: SeedContext,
  solutionId: string,
  issueId: string,
  title: string,
  content: string,
  tagNames: string[],
  voteCount: number,
  metadata: ProcessedItem['metadata'],
  displayFields: SolutionDisplayFields
): Promise<void> {
  if (!ctx.weaviateClient) return;

  try {
    const collection = ctx.weaviateClient.collections.get(SOLUTION_COLLECTION);

    await collection.data.insert({
      solutionId,
      issueId,
      organizationId: ctx.publicOrgId,
      title,
      content,
      tags: tagNames,
      voteCount,
      createdAt: new Date(),
      issueCreatedAt: displayFields.issueCreatedAt,
      project: null,
      techStack: metadata.techStack,
      packageNames: [],
      packageVersions: [],
      errorType: metadata.errorType,
      errorCategory: null,
      severity: metadata.severity,
      environment: metadata.environment,
      fileTypes: [],
      codePatterns: [],
      affectedArea: metadata.affectedArea,
      frequency: metadata.frequency,
      hasMinimalRepro: null,
      rootCause: metadata.rootCause,
      fixType: metadata.fixType,
      complexity: metadata.complexity,
      relatedPatterns: [],
      lessonsLearned: [],
      authorName: displayFields.authorName,
      agentSlug: displayFields.agentSlug,
      agentDisplayName: displayFields.agentDisplayName,
      organizationName: displayFields.organizationName,
      isAccepted: displayFields.isAccepted,
      authorTrustLevel: displayFields.authorTrustLevel,
      severityOrder: severityToOrder(metadata.severity),
      complexityOrder: complexityToOrder(metadata.complexity),
    });
  } catch (err) {
    console.warn(`  [Weaviate] Failed to index solution ${solutionId}: ${err}`);
  }
}

async function indexIssueInWeaviate(
  ctx: SeedContext,
  issueId: string,
  title: string,
  description: string,
  tagNames: string[],
  metadata: ProcessedItem['metadata']
): Promise<void> {
  if (!ctx.weaviateClient) return;

  try {
    const collection = ctx.weaviateClient.collections.get(ISSUE_COLLECTION);
    await collection.data.insert({
      issueId,
      organizationId: ctx.publicOrgId,
      title,
      description: description.slice(0, 10000),
      tags: tagNames,
      solutionCount: 0,
      createdAt: new Date(),
      project: null,
      techStack: metadata.techStack,
      errorType: metadata.errorType,
    });
  } catch (err) {
    console.warn(`  [Weaviate] Failed to index issue ${issueId}: ${err}`);
  }
}

/** Clean up database and weaviate connections. */
export async function cleanup(ctx: SeedContext): Promise<void> {
  if (ctx.weaviateClient) {
    ctx.weaviateClient.close();
  }
  await closeDb();
}
