import { eq, and, or, lt, sql, desc, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createHash } from 'crypto';
import {
  rawSources,
  wikiPages,
  wikiPageHistory,
  wikiPageLinks,
  wikiPageSources,
  wikiPageVotes,
  wikiLog,
  organizations,
  domains,
  agents,
  users,
} from '@agent-in-sync/db-client';
import type {
  IngestSourceInput,
  UpsertWikiPageInput,
  WikiSearchInput,
  WikiSearchResult,
  SourceRef,
} from '@agent-in-sync/shared';
import { Filters } from 'weaviate-client';
import { WIKI_PAGE_COLLECTION } from '../weaviate/client.js';
import { indexWikiPageInWeaviate } from '../weaviate/wiki-sync.js';
import type { WikiPageVector } from '../weaviate/wiki-sync.js';
import type { ServiceDependencies } from './dependencies.js';
import { logger } from '../observability/logger.js';

export type WikiAuthContext = {
  userId: string;
  organizationId: string;
  agentId?: string;
  apiKeyId?: string;
};

export class DuplicateSourceError extends Error {
  constructor(public readonly existingSourceId: string) {
    super('DUPLICATE_SOURCE');
    this.name = 'DuplicateSourceError';
  }
}

export class VersionConflictError extends Error {
  constructor(
    public readonly currentVersion: number,
    public readonly currentBody: string
  ) {
    super('VERSION_CONFLICT');
    this.name = 'VersionConflictError';
  }
}

const WIKI_HYBRID_ALPHA = 0.7;
const WIKI_MAX_VECTOR_DISTANCE = 0.8;

export class WikiService {
  constructor(private deps: ServiceDependencies) {}

  // === Source Ingestion ===

  async ingestSource(
    input: IngestSourceInput,
    ctx: WikiAuthContext
  ): Promise<{ sourceId: string; status: 'ingested' }> {
    const { db } = this.deps;

    const contentHash = createHash('sha256')
      .update(input.title + '\n' + input.content)
      .digest('hex');

    const [existing] = await db
      .select({ id: rawSources.id })
      .from(rawSources)
      .where(
        and(
          eq(rawSources.contentHash, contentHash),
          eq(rawSources.organizationId, ctx.organizationId)
        )
      )
      .limit(1);

    if (existing) {
      throw new DuplicateSourceError(existing.id);
    }

    const normalizedTags = input.tags?.map(t => t.toLowerCase().trim());

    const [inserted] = await db
      .insert(rawSources)
      .values({
        organizationId: ctx.organizationId,
        authorId: ctx.userId,
        authorAgentId: ctx.agentId ?? null,
        title: input.title,
        content: input.content,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? null,
        contentHash,
        project: input.project ?? null,
        tags: normalizedTags ?? null,
      })
      .returning({ id: rawSources.id });

    await db.insert(wikiLog).values({
      organizationId: ctx.organizationId,
      operation: 'ingest',
      agentId: ctx.agentId ?? null,
      summary: `Ingested source: ${input.title}`,
      relatedSourceIds: [inserted!.id],
    });

    logger.info('Source ingested', { sourceId: inserted!.id, sourceType: input.sourceType });

    return { sourceId: inserted!.id, status: 'ingested' };
  }

  // === Wiki Page CRUD ===

  async upsertPage(
    input: UpsertWikiPageInput,
    ctx: WikiAuthContext
  ): Promise<{ id: string; version: number; status: 'created' | 'updated' }> {
    const { db } = this.deps;

    const verifiedDomainId = await this.getVerifiedDomainId(ctx.organizationId);

    const [existing] = await db
      .select({
        id: wikiPages.id,
        organizationId: wikiPages.organizationId,
        version: wikiPages.version,
        title: wikiPages.title,
        summary: wikiPages.summary,
        body: wikiPages.body,
        visibility: wikiPages.visibility,
        techStack: wikiPages.techStack,
        editCount: wikiPages.editCount,
        voteCount: wikiPages.voteCount,
        createdAt: wikiPages.createdAt,
      })
      .from(wikiPages)
      .leftJoin(organizations, eq(wikiPages.organizationId, organizations.id))
      .where(
        and(
          eq(wikiPages.slug, input.slug),
          or(
            eq(wikiPages.organizationId, ctx.organizationId),
            verifiedDomainId
              ? and(
                  eq(wikiPages.visibility, 'domain'),
                  eq(organizations.domainId, verifiedDomainId)
                )
              : sql`false`,
            eq(wikiPages.visibility, 'public')
          )
        )
      )
      .orderBy(sql`(${wikiPages.organizationId} = ${ctx.organizationId}) DESC`)
      .limit(1);

    if (existing) {
      await this.checkEditPermission(existing, ctx);
      if (input.visibility !== undefined && input.visibility !== existing.visibility) {
        this.checkVisibilityChangePermission(existing, ctx);
      }
    }

    const normalizedTags = input.tags?.map(t => t.toLowerCase().trim());

    if (!existing) {
      const [inserted] = await db
        .insert(wikiPages)
        .values({
          organizationId: ctx.organizationId,
          createdByUserId: ctx.userId,
          createdByAgentId: ctx.agentId ?? null,
          lastEditedByAgentId: ctx.agentId ?? null,
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          body: input.body,
          version: 1,
          visibility: input.visibility ?? 'domain',
          project: input.project ?? null,
          techStack: normalizedTags ?? null,
        })
        .returning({ id: wikiPages.id, version: wikiPages.version });

      const pageId = inserted!.id;

      if (input.sourcedFrom?.length) {
        await this.addSourceRefs(pageId, input.sourcedFrom);
      }

      if (input.linkedPages?.length) {
        await this.resolveAndLinkPages(pageId, input.linkedPages, ctx);
      }

      await db.insert(wikiLog).values({
        organizationId: ctx.organizationId,
        operation: 'page_created',
        agentId: ctx.agentId ?? null,
        summary: `Created wiki page: ${input.title}`,
        relatedPageIds: [pageId],
      });

      const now = new Date();
      this._syncPageToWeaviate(
        {
          id: pageId,
          slug: input.slug,
          title: input.title,
          body: input.body,
          project: input.project ?? null,
          tags: normalizedTags ?? null,
          voteCount: 0,
          editCount: 0,
          version: 1,
          visibility: input.visibility ?? 'domain',
          domainId: verifiedDomainId,
          createdAt: now,
          updatedAt: now,
        },
        ctx
      ).catch(err => logger.logError('Wiki Weaviate sync failed on create', err));

      logger.info('Wiki page created', { slug: input.slug, pageId });
      return { id: pageId, version: 1, status: 'created' };
    }

    // UPDATE — version required for optimistic locking
    if (input.version == null) {
      throw new Error('VERSION_REQUIRED');
    }

    if (input.version !== existing.version) {
      throw new VersionConflictError(existing.version, existing.body);
    }

    // Save current version to history
    await db.insert(wikiPageHistory).values({
      wikiPageId: existing.id,
      version: existing.version,
      title: existing.title,
      summary: existing.summary ?? null,
      body: existing.body,
      tags: existing.techStack ?? null,
      editedByUserId: ctx.userId,
      editedByAgentId: ctx.agentId ?? null,
      editSummary: input.editSummary ?? null,
    });

    const newVersion = existing.version + 1;

    const [updated] = await db
      .update(wikiPages)
      .set({
        title: input.title,
        summary: input.summary,
        body: input.body,
        version: newVersion,
        lastEditedByAgentId: ctx.agentId ?? null,
        editCount: sql`${wikiPages.editCount} + 1`,
        // Reset vote count each version so votes reflect the current content,
        // not accumulated sentiment from all previous versions.
        voteCount: 0,
        project: input.project ?? null,
        techStack: normalizedTags ?? null,
        updatedAt: new Date(),
        ...(input.visibility !== undefined && existing.organizationId === ctx.organizationId
          ? { visibility: input.visibility }
          : {}),
      })
      .where(and(eq(wikiPages.id, existing.id), eq(wikiPages.version, existing.version)))
      .returning({ id: wikiPages.id, version: wikiPages.version });

    if (!updated) {
      throw new Error('VERSION_CONFLICT');
    }

    if (input.sourcedFrom?.length) {
      await this.addSourceRefs(existing.id, input.sourcedFrom);
    }

    if (input.linkedPages?.length) {
      await this.resolveAndLinkPages(existing.id, input.linkedPages, ctx);
    }

    await db.insert(wikiLog).values({
      organizationId: ctx.organizationId,
      operation: 'page_updated',
      agentId: ctx.agentId ?? null,
      summary: `Updated wiki page: ${input.title}${input.editSummary ? ` — ${input.editSummary}` : ''}`,
      relatedPageIds: [existing.id],
    });

    const finalVisibility =
      input.visibility !== undefined && existing.organizationId === ctx.organizationId
        ? input.visibility
        : existing.visibility;

    this._syncPageToWeaviate(
      {
        id: existing.id,
        slug: input.slug,
        title: input.title,
        body: input.body,
        project: input.project ?? null,
        tags: normalizedTags ?? null,
        voteCount: 0,
        editCount: existing.editCount + 1,
        version: newVersion,
        visibility: finalVisibility,
        domainId: verifiedDomainId,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      },
      ctx
    ).catch(err => logger.logError('Wiki Weaviate sync failed on update', err));

    logger.info('Wiki page updated', { slug: input.slug, version: newVersion });
    return { id: existing.id, version: newVersion, status: 'updated' };
  }

  async getPage(organizationId: string, slug: string) {
    const { db } = this.deps;

    const createdByAgent = alias(agents, 'created_by_agent');
    const lastEditedByAgent = alias(agents, 'last_edited_by_agent');

    const [row] = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        summary: wikiPages.summary,
        body: wikiPages.body,
        version: wikiPages.version,
        voteCount: wikiPages.voteCount,
        editCount: wikiPages.editCount,
        status: wikiPages.status,
        project: wikiPages.project,
        tags: wikiPages.techStack,
        createdAt: wikiPages.createdAt,
        updatedAt: wikiPages.updatedAt,
        createdByUserName: users.name,
        createdByAgentSlug: createdByAgent.slug,
        createdByAgentName: createdByAgent.displayName,
        lastEditedByAgentSlug: lastEditedByAgent.slug,
        lastEditedByAgentName: lastEditedByAgent.displayName,
      })
      .from(wikiPages)
      .leftJoin(users, eq(wikiPages.createdByUserId, users.id))
      .leftJoin(createdByAgent, eq(wikiPages.createdByAgentId, createdByAgent.id))
      .leftJoin(lastEditedByAgent, eq(wikiPages.lastEditedByAgentId, lastEditedByAgent.id))
      .where(and(eq(wikiPages.organizationId, organizationId), eq(wikiPages.slug, slug)))
      .limit(1);

    if (!row) return null;

    const sources = await db
      .select({
        id: rawSources.id,
        title: rawSources.title,
        sourceType: rawSources.sourceType,
        sourceUrl: rawSources.sourceUrl,
      })
      .from(wikiPageSources)
      .innerJoin(rawSources, eq(wikiPageSources.sourceId, rawSources.id))
      .where(
        and(eq(wikiPageSources.wikiPageId, row.id), eq(wikiPageSources.sourceType, 'raw_source'))
      );

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sources,
    };
  }

  // === List ===

  async listPages(
    organizationId: string,
    opts: { limit?: number; offset?: number; project?: string }
  ): Promise<{
    results: Array<{
      id: string;
      slug: string;
      title: string;
      summary: string | null;
      version: number;
      voteCount: number;
      editCount: number;
      project: string | null;
      tags: string[] | null;
      updatedAt: string;
    }>;
    hasMore: boolean;
  }> {
    const { db } = this.deps;
    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = opts.offset ?? 0;

    const conditions = [eq(wikiPages.organizationId, organizationId)];
    if (opts.project) {
      conditions.push(eq(wikiPages.project, opts.project));
    }

    const rows = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        summary: wikiPages.summary,
        version: wikiPages.version,
        voteCount: wikiPages.voteCount,
        editCount: wikiPages.editCount,
        project: wikiPages.project,
        tags: wikiPages.techStack,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(and(...conditions))
      .orderBy(desc(wikiPages.updatedAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      results: rows.slice(0, limit).map(r => ({
        ...r,
        updatedAt: r.updatedAt.toISOString(),
      })),
      hasMore,
    };
  }

  // === Search ===

  async search(
    input: WikiSearchInput,
    ctx: WikiAuthContext
  ): Promise<{ results: WikiSearchResult[]; hasMore: boolean }> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return { results: [], hasMore: false };

    const { organizationId } = ctx;
    const limit = input.limit ?? 10;
    const fetchLimit = limit + 1;

    try {
      const collection = weaviateClient.collections.get<WikiPageVector>(WIKI_PAGE_COLLECTION);

      let searchFilter;

      if (input.scope === 'org_only') {
        searchFilter = collection.filter.byProperty('organizationId').equal(organizationId);
      } else {
        const verifiedDomainId = await this.getVerifiedDomainId(organizationId);
        const ownOrgFilter = collection.filter.byProperty('organizationId').equal(organizationId);
        const publicFilter = collection.filter.byProperty('visibility').equal('public');

        if (verifiedDomainId) {
          const domainFilter = Filters.and(
            collection.filter.byProperty('visibility').equal('domain'),
            collection.filter.byProperty('domainId').equal(verifiedDomainId)
          );
          searchFilter = Filters.or(ownOrgFilter, domainFilter, publicFilter);
        } else {
          searchFilter = Filters.or(ownOrgFilter, publicFilter);
        }
      }

      const results = await collection.query.hybrid(input.query, {
        alpha: WIKI_HYBRID_ALPHA,
        fusionType: 'RelativeScore',
        autoLimit: 1,
        maxVectorDistance: WIKI_MAX_VECTOR_DISTANCE,
        queryProperties: [{ name: 'title', weight: 2 }, 'content'],
        targetVector: collection.multiTargetVector.manualWeights({
          titleVec: 0.4,
          summaryVec: 0.6,
        }),
        rerank: { property: 'title', query: input.query },
        limit: fetchLimit,
        offset: input.offset ?? 0,
        filters: searchFilter,
        returnMetadata: ['score', 'rerankScore'],
      });

      const minScore = input.minRelevance ?? 0;

      const mapped: WikiSearchResult[] = results.objects
        .map(obj => {
          const raw = obj.metadata?.rerankScore ?? obj.metadata?.score ?? 0;
          const relevance = obj.metadata?.rerankScore != null ? 1 / (1 + Math.exp(-raw)) : raw;

          return {
            slug: obj.properties.slug,
            title: obj.properties.title,
            summary: obj.properties.content ?? null,
            voteCount: obj.properties.voteCount ?? 0,
            editCount: obj.properties.editCount ?? 0,
            version: obj.properties.version ?? 1,
            project: obj.properties.project ?? null,
            tags: obj.properties.tags ?? null,
            relevance,
            updatedAt: obj.properties.updatedAt ?? '',
          };
        })
        .filter(r => r.relevance >= minScore);

      const hasMore = mapped.length > limit;

      logger.info('Wiki search completed', {
        query: input.query,
        resultCount: Math.min(mapped.length, limit),
        hasMore,
        scope: input.scope ?? 'all',
      });

      return {
        results: mapped.slice(0, limit),
        hasMore,
      };
    } catch (err) {
      logger.logError('Wiki search failed', err, { queryLength: input.query.length });
      return { results: [], hasMore: false };
    }
  }

  // === Cross-References & Provenance ===

  async addSourceRefs(pageId: string, refs: SourceRef[]): Promise<void> {
    if (refs.length === 0) return;
    const { db } = this.deps;

    await db
      .insert(wikiPageSources)
      .values(
        refs.map(ref => ({
          wikiPageId: pageId,
          sourceType: ref.type,
          sourceId: ref.id,
        }))
      )
      .onConflictDoNothing();
  }

  async linkPages(
    sourcePageId: string,
    targetPageId: string,
    relationship: string,
    ctx: { organizationId: string; agentId?: string }
  ): Promise<void> {
    const { db } = this.deps;

    await db
      .insert(wikiPageLinks)
      .values({ sourcePageId, targetPageId, relationship })
      .onConflictDoNothing();

    await db.insert(wikiLog).values({
      organizationId: ctx.organizationId,
      operation: 'page_linked',
      agentId: ctx.agentId ?? null,
      summary: `Linked pages: ${sourcePageId} → ${targetPageId} (${relationship})`,
      relatedPageIds: [sourcePageId, targetPageId],
    });
  }

  // === Lint ===

  async lint(
    organizationId: string,
    options: { scope?: string; checks?: readonly string[]; project?: string }
  ): Promise<{
    stale?: Array<{
      slug: string;
      title: string;
      lastUpdated: string;
      daysSinceUpdate: number;
    }>;
    orphans?: Array<{ slug: string; title: string; inboundLinks: number }>;
    summary: string;
  }> {
    const { db } = this.deps;
    const checks = options.checks ?? ['stale', 'orphans', 'gaps', 'source_drift'];
    const summaryParts: string[] = [];
    let stale:
      | Array<{
          slug: string;
          title: string;
          lastUpdated: string;
          daysSinceUpdate: number;
        }>
      | undefined;
    let orphans: Array<{ slug: string; title: string; inboundLinks: number }> | undefined;

    if (checks.includes('stale')) {
      const staleThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const stalePages = await db
        .select({
          slug: wikiPages.slug,
          title: wikiPages.title,
          updatedAt: wikiPages.updatedAt,
        })
        .from(wikiPages)
        .where(
          and(eq(wikiPages.organizationId, organizationId), lt(wikiPages.updatedAt, staleThreshold))
        );

      stale = stalePages.map(p => ({
        slug: p.slug,
        title: p.title,
        lastUpdated: p.updatedAt.toISOString(),
        daysSinceUpdate: Math.floor((Date.now() - p.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
      }));
      summaryParts.push(`${stale.length} stale page(s)`);
    }

    if (checks.includes('orphans')) {
      const allPages = await db
        .select({ id: wikiPages.id, slug: wikiPages.slug, title: wikiPages.title })
        .from(wikiPages)
        .where(eq(wikiPages.organizationId, organizationId));

      const linkedTargetIds = await db
        .selectDistinct({ targetPageId: wikiPageLinks.targetPageId })
        .from(wikiPageLinks);

      const linkedSet = new Set(linkedTargetIds.map(r => r.targetPageId));
      orphans = allPages
        .filter(p => !linkedSet.has(p.id))
        .map(p => ({ slug: p.slug, title: p.title, inboundLinks: 0 }));

      summaryParts.push(`${orphans.length} orphan page(s)`);
    }

    const summary = summaryParts.join(', ') || 'No issues found';

    await db.insert(wikiLog).values({
      organizationId,
      operation: 'lint_pass',
      summary: `Lint: ${summary}`,
    });

    return { stale, orphans, summary };
  }

  // === Sources ===

  async getSource(organizationId: string, sourceId: string) {
    const { db } = this.deps;
    const [row] = await db
      .select({
        id: rawSources.id,
        title: rawSources.title,
        content: rawSources.content,
        sourceType: rawSources.sourceType,
        sourceUrl: rawSources.sourceUrl,
        project: rawSources.project,
        tags: rawSources.tags,
        createdAt: rawSources.createdAt,
      })
      .from(rawSources)
      .where(and(eq(rawSources.id, sourceId), eq(rawSources.organizationId, organizationId)))
      .limit(1);
    return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
  }

  async listSources(
    organizationId: string,
    opts: { limit?: number; offset?: number; project?: string }
  ): Promise<{
    results: Array<{
      id: string;
      title: string;
      sourceType: string;
      sourceUrl: string | null;
      project: string | null;
      tags: string[] | null;
      createdAt: string;
    }>;
    hasMore: boolean;
  }> {
    const { db } = this.deps;
    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = opts.offset ?? 0;

    const conditions = [eq(rawSources.organizationId, organizationId)];
    if (opts.project) conditions.push(eq(rawSources.project, opts.project));

    const rows = await db
      .select({
        id: rawSources.id,
        title: rawSources.title,
        sourceType: rawSources.sourceType,
        sourceUrl: rawSources.sourceUrl,
        project: rawSources.project,
        tags: rawSources.tags,
        createdAt: rawSources.createdAt,
      })
      .from(rawSources)
      .where(and(...conditions))
      .orderBy(desc(rawSources.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      results: rows.slice(0, limit).map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
      hasMore,
    };
  }

  // === Activity Log ===

  async listLog(
    organizationId: string,
    opts: { limit?: number; offset?: number }
  ): Promise<{
    results: Array<{
      id: string;
      operation: string;
      agentId: string | null;
      summary: string;
      relatedPageIds: string[] | null;
      relatedSourceIds: string[] | null;
      createdAt: string;
    }>;
    hasMore: boolean;
  }> {
    const { db } = this.deps;
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    const rows = await db
      .select({
        id: wikiLog.id,
        operation: wikiLog.operation,
        agentId: wikiLog.agentId,
        summary: wikiLog.summary,
        relatedPageIds: wikiLog.relatedPageIds,
        relatedSourceIds: wikiLog.relatedSourceIds,
        createdAt: wikiLog.createdAt,
      })
      .from(wikiLog)
      .where(eq(wikiLog.organizationId, organizationId))
      .orderBy(desc(wikiLog.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      results: rows.slice(0, limit).map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
      hasMore,
    };
  }

  // === Edit History ===

  async listHistory(
    organizationId: string,
    opts: { limit?: number; offset?: number }
  ): Promise<{
    results: Array<{
      id: string;
      wikiPageId: string;
      pageSlug: string;
      pageTitle: string;
      version: number;
      editedByAgentId: string | null;
      editSummary: string | null;
      createdAt: string;
    }>;
    hasMore: boolean;
  }> {
    const { db } = this.deps;
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    const rows = await db
      .select({
        id: wikiPageHistory.id,
        wikiPageId: wikiPageHistory.wikiPageId,
        pageSlug: wikiPages.slug,
        pageTitle: wikiPages.title,
        version: wikiPageHistory.version,
        editedByAgentId: wikiPageHistory.editedByAgentId,
        editSummary: wikiPageHistory.editSummary,
        createdAt: wikiPageHistory.createdAt,
      })
      .from(wikiPageHistory)
      .innerJoin(wikiPages, eq(wikiPageHistory.wikiPageId, wikiPages.id))
      .where(eq(wikiPages.organizationId, organizationId))
      .orderBy(desc(wikiPageHistory.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    return {
      results: rows.slice(0, limit).map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
      hasMore,
    };
  }

  // === Graph ===

  async listGraph(organizationId: string): Promise<{
    nodes: Array<{
      id: string;
      slug: string;
      title: string;
      project: string | null;
      voteCount: number;
    }>;
    edges: Array<{ sourceId: string; targetId: string; relationship: string }>;
  }> {
    const { db } = this.deps;

    const nodes = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        project: wikiPages.project,
        voteCount: wikiPages.voteCount,
      })
      .from(wikiPages)
      .where(eq(wikiPages.organizationId, organizationId));

    const pageIds = new Set(nodes.map(n => n.id));

    const edges =
      nodes.length > 0
        ? await db
            .select({
              sourceId: wikiPageLinks.sourcePageId,
              targetId: wikiPageLinks.targetPageId,
              relationship: wikiPageLinks.relationship,
            })
            .from(wikiPageLinks)
            .where(inArray(wikiPageLinks.sourcePageId, Array.from(pageIds)))
            .limit(500)
        : [];

    return { nodes, edges };
  }

  // === Version History ===

  async listPageVersions(
    organizationId: string,
    slug: string
  ): Promise<{
    current: {
      version: number;
      title: string;
      summary: string | null;
      body: string;
      tags: string[] | null;
      updatedAt: string;
    };
    history: Array<{
      version: number;
      title: string;
      summary: string | null;
      body: string;
      tags: string[] | null;
      editSummary: string | null;
      createdAt: string;
    }>;
  } | null> {
    const { db } = this.deps;

    const [page] = await db
      .select({
        id: wikiPages.id,
        version: wikiPages.version,
        title: wikiPages.title,
        summary: wikiPages.summary,
        body: wikiPages.body,
        tags: wikiPages.techStack,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(and(eq(wikiPages.organizationId, organizationId), eq(wikiPages.slug, slug)))
      .limit(1);

    if (!page) return null;

    const historyRows = await db
      .select({
        version: wikiPageHistory.version,
        title: wikiPageHistory.title,
        summary: wikiPageHistory.summary,
        body: wikiPageHistory.body,
        tags: wikiPageHistory.tags,
        editSummary: wikiPageHistory.editSummary,
        createdAt: wikiPageHistory.createdAt,
      })
      .from(wikiPageHistory)
      .where(eq(wikiPageHistory.wikiPageId, page.id))
      .orderBy(desc(wikiPageHistory.version));

    return {
      current: {
        version: page.version,
        title: page.title,
        summary: page.summary,
        body: page.body,
        tags: page.tags,
        updatedAt: page.updatedAt.toISOString(),
      },
      history: historyRows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    };
  }

  // === Helpers ===

  private async _syncPageToWeaviate(
    data: {
      id: string;
      slug: string;
      title: string;
      body: string;
      project: string | null;
      tags: string[] | null;
      voteCount: number;
      editCount: number;
      version: number;
      visibility: string;
      domainId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    ctx: WikiAuthContext
  ): Promise<void> {
    const { weaviateClient, db } = this.deps;
    if (!weaviateClient) return;

    let agentSlug = '';
    if (ctx.agentId) {
      const [agent] = await db
        .select({ slug: agents.slug })
        .from(agents)
        .where(eq(agents.id, ctx.agentId))
        .limit(1);
      agentSlug = agent?.slug ?? '';
    }

    await indexWikiPageInWeaviate(weaviateClient, {
      wikiPageId: data.id,
      organizationId: ctx.organizationId,
      domainId: data.domainId,
      slug: data.slug,
      title: data.title,
      content: data.body,
      tags: data.tags ?? [],
      project: data.project ?? '',
      voteCount: data.voteCount,
      editCount: data.editCount,
      version: data.version,
      visibility: data.visibility as 'private' | 'domain' | 'public',
      createdByAgentSlug: agentSlug,
      lastEditedByAgentSlug: agentSlug,
      updatedAt: data.updatedAt.toISOString(),
      createdAt: data.createdAt.toISOString(),
    });
  }

  private async _syncVoteCountToWeaviate(wikiPageId: string, newCount: number): Promise<void> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return;
    try {
      const collection = weaviateClient.collections.get(WIKI_PAGE_COLLECTION);
      const existing = await collection.query.fetchObjects({
        filters: collection.filter.byProperty('wikiPageId').equal(wikiPageId),
        limit: 1,
      });
      if (existing.objects[0]) {
        await collection.data.update({
          id: existing.objects[0].uuid,
          properties: { voteCount: newCount },
        });
      }
    } catch (err) {
      logger.logError('Failed to sync wiki vote count to Weaviate', err, { wikiPageId, newCount });
    }
  }

  private async getVerifiedDomainId(orgId: string): Promise<string | null> {
    const { db } = this.deps;
    const [row] = await db
      .select({ domainId: organizations.domainId, status: domains.status })
      .from(organizations)
      .leftJoin(domains, eq(organizations.domainId, domains.id))
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!row?.domainId || row.status !== 'verified') return null;
    return row.domainId;
  }

  private async isSameVerifiedDomain(ownerOrgId: string, requesterOrgId: string): Promise<boolean> {
    if (ownerOrgId === requesterOrgId) return true;
    const ownerDomainId = await this.getVerifiedDomainId(ownerOrgId);
    if (!ownerDomainId) return false;
    const requesterDomainId = await this.getVerifiedDomainId(requesterOrgId);
    return ownerDomainId === requesterDomainId;
  }

  private async checkEditPermission(
    page: { organizationId: string; visibility: string },
    ctx: WikiAuthContext
  ): Promise<void> {
    if (page.organizationId === ctx.organizationId) return;
    if (page.visibility === 'public') return;
    if (page.visibility === 'domain') {
      const sameDomain = await this.isSameVerifiedDomain(page.organizationId, ctx.organizationId);
      if (sameDomain) return;
    }
    throw new Error('EDIT_FORBIDDEN');
  }

  private checkVisibilityChangePermission(
    page: { organizationId: string },
    ctx: WikiAuthContext
  ): void {
    if (page.organizationId !== ctx.organizationId) {
      throw new Error('VISIBILITY_CHANGE_FORBIDDEN');
    }
  }

  private async resolveAndLinkPages(
    pageId: string,
    targetSlugs: string[],
    ctx: WikiAuthContext
  ): Promise<void> {
    const { db } = this.deps;

    for (const targetSlug of targetSlugs) {
      const [targetPage] = await db
        .select({ id: wikiPages.id })
        .from(wikiPages)
        .where(
          and(eq(wikiPages.organizationId, ctx.organizationId), eq(wikiPages.slug, targetSlug))
        )
        .limit(1);

      if (targetPage) {
        await this.linkPages(pageId, targetPage.id, 'related', ctx);
      }
    }
  }

  async voteOnPage(
    slug: string,
    direction: 'up' | 'down',
    ctx: WikiAuthContext
  ): Promise<{ voteCount: number }> {
    const { db } = this.deps;

    const [page] = await db
      .select({ id: wikiPages.id, version: wikiPages.version, voteCount: wikiPages.voteCount })
      .from(wikiPages)
      .where(and(eq(wikiPages.organizationId, ctx.organizationId), eq(wikiPages.slug, slug)))
      .limit(1);

    if (!page) throw new Error('PAGE_NOT_FOUND');

    // Look up any existing vote for this user on the current version of this page.
    // If the page was updated since the user last voted, no existing vote is found
    // and they can vote fresh on the new version.
    const voteFilter = ctx.apiKeyId
      ? and(
          eq(wikiPageVotes.wikiPageId, page.id),
          eq(wikiPageVotes.version, page.version),
          eq(wikiPageVotes.apiKeyId, ctx.apiKeyId)
        )
      : and(
          eq(wikiPageVotes.wikiPageId, page.id),
          eq(wikiPageVotes.version, page.version),
          eq(wikiPageVotes.userId, ctx.userId)
        );

    const [existingVote] = await db
      .select({ id: wikiPageVotes.id, direction: wikiPageVotes.direction })
      .from(wikiPageVotes)
      .where(voteFilter)
      .limit(1);

    const [updated] = await db.transaction(async tx => {
      let delta = 0;

      if (existingVote) {
        if (existingVote.direction === direction) {
          // Same direction — toggle off
          await tx.delete(wikiPageVotes).where(eq(wikiPageVotes.id, existingVote.id));
          delta = direction === 'up' ? -1 : 1;
        } else {
          // Switch direction
          await tx
            .update(wikiPageVotes)
            .set({ direction })
            .where(eq(wikiPageVotes.id, existingVote.id));
          delta = direction === 'up' ? 2 : -2;
        }
      } else {
        await tx.insert(wikiPageVotes).values({
          wikiPageId: page.id,
          version: page.version,
          userId: ctx.userId,
          apiKeyId: ctx.apiKeyId ?? null,
          agentId: ctx.agentId ?? null,
          direction,
        });
        delta = direction === 'up' ? 1 : -1;
      }

      return tx
        .update(wikiPages)
        .set({ voteCount: sql`${wikiPages.voteCount} + ${delta}` })
        .where(eq(wikiPages.id, page.id))
        .returning({ voteCount: wikiPages.voteCount });
    });

    if (!updated) throw new Error('VOTE_UPDATE_FAILED');

    this._syncVoteCountToWeaviate(page.id, updated.voteCount).catch(() => {});

    return { voteCount: updated.voteCount };
  }
}
