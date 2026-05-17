import { eq, sql, desc, inArray, and, asc, isNull } from 'drizzle-orm';
import { Filters } from 'weaviate-client';
import {
  issues,
  issueTags,
  tags,
  users,
  organizations,
  solutions,
  comments,
  agents,
  searchEvents,
} from '@agent-in-sync/db-client';
import {
  searchInputSchema as sharedSearchInputSchema,
  type SearchInput as SharedSearchInput,
  type PackageFilter,
  resolveOrgSettings,
  type OrganizationSettings,
} from '@agent-in-sync/shared';
import { LRUCache } from 'lru-cache';
import { SOLUTION_COLLECTION, type SolutionVector } from '../weaviate/index.js';
import { normalizeTag } from './submit.service.js';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';

type TrustLevel = 'new' | 'established' | 'trusted' | 'verified' | 'suspended';

const TRUST_MULTIPLIERS: Record<TrustLevel, number> = {
  new: 0.8,
  established: 1.0,
  trusted: 1.1,
  verified: 1.2,
  suspended: 0.0,
};

export const searchSchema = sharedSearchInputSchema;

export type SearchInput = SharedSearchInput;

export type SearchResult = {
  solution_id: string;
  issue_id: string;
  title: string;
  summary: string;
  votes: number;
  timestamp: string;
  tags: string[];
  author_name: string | null;
  author_agent_slug: string | null;
  author_agent_name: string | null;
  organization_name: string | null;
  is_accepted: boolean;
  author_trust_level: TrustLevel;
  relevance?: number | null;
  rank_score?: number;
  metadata?: {
    project?: string | null;
    techStack?: string[] | null;
    errorType?: string | null;
    severity?: string | null;
    complexity?: string | null;
    environment?: string | null;
    affectedArea?: string | null;
    frequency?: string | null;
    rootCause?: string | null;
    fixType?: string | null;
    hasMinimalRepro?: boolean | null;
    fileTypes?: string[] | null;
    codePatterns?: string[] | null;
    relatedPatterns?: string[] | null;
  };
};

export type SearchResponse = {
  results: SearchResult[];
  sort_order: string;
  hasMore: boolean;
};

export type FacetsResult = {
  projects: string[];
  techStack: string[];
  tags: string[];
  errorTypes: string[];
  severities: string[];
  environments: string[];
  affectedAreas: string[];
  frequencies: string[];
  rootCauses: string[];
  fixTypes: string[];
  complexities: string[];
};

type WeaviateFilter = {
  organizationIds: string[];
  tags?: string[];
  project?: string;
  techStack?: string[];
  packageNames?: string[];
  errorType?: string;
  severity?: string;
  environment?: string;
  fileTypes?: string[];
  codePatterns?: string[];
  affectedArea?: string;
  frequency?: string;
  hasMinimalRepro?: boolean;
  rootCause?: string;
  fixType?: string;
  complexity?: string;
  relatedPatterns?: string[];
};

const RELEVANCE_THRESHOLD = 0.25;
// 0.5 = equal BM25/vector weight. Coding agents search with exact technical terms
// (error messages, package names, stack traces) where BM25 outperforms pure vector.
// Higher alpha (e.g. 0.7) caused recall failures for keyword-heavy queries.
const HYBRID_ALPHA = 0.5;
const MAX_VECTOR_DISTANCE = 0.75;
const MIN_CANDIDATE_POOL = 100;

function normalizeVoteScore(voteCount: number): number {
  if (voteCount <= 0) return 0;
  return Math.min(1, Math.log10(voteCount + 1) / 3);
}

function computeRankScore(
  semanticScore: number | null,
  voteCount: number,
  isAccepted: boolean,
  authorTrust: TrustLevel
): number {
  const effectiveScore = semanticScore ?? 0.5;
  return (
    effectiveScore * 0.65 +
    normalizeVoteScore(voteCount) * 0.15 +
    (isAccepted ? 0.1 : 0) +
    TRUST_MULTIPLIERS[authorTrust] * 0.1
  );
}

export class SearchService {
  constructor(private deps: ServiceDependencies) {}

  private buildWeaviateFilter(filters: WeaviateFilter) {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return null;

    const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterConditions: any[] = [];

    filterConditions.push(
      collection.filter.byProperty('organizationId').containsAny(filters.organizationIds)
    );

    if (filters.tags && filters.tags.length > 0) {
      filterConditions.push(collection.filter.byProperty('tags').containsAny(filters.tags));
    }

    if (filters.project) {
      filterConditions.push(collection.filter.byProperty('project').equal(filters.project));
    }

    if (filters.techStack && filters.techStack.length > 0) {
      filterConditions.push(
        collection.filter.byProperty('techStack').containsAny(filters.techStack)
      );
    }

    if (filters.packageNames && filters.packageNames.length > 0) {
      filterConditions.push(
        collection.filter.byProperty('packageNames').containsAny(filters.packageNames)
      );
    }

    if (filters.errorType) {
      filterConditions.push(collection.filter.byProperty('errorType').equal(filters.errorType));
    }

    if (filters.severity) {
      filterConditions.push(collection.filter.byProperty('severity').equal(filters.severity));
    }

    if (filters.environment) {
      filterConditions.push(collection.filter.byProperty('environment').equal(filters.environment));
    }

    if (filters.fileTypes && filters.fileTypes.length > 0) {
      filterConditions.push(
        collection.filter.byProperty('fileTypes').containsAny(filters.fileTypes)
      );
    }

    if (filters.codePatterns && filters.codePatterns.length > 0) {
      filterConditions.push(
        collection.filter.byProperty('codePatterns').containsAny(filters.codePatterns)
      );
    }

    if (filters.affectedArea) {
      filterConditions.push(
        collection.filter.byProperty('affectedArea').equal(filters.affectedArea)
      );
    }

    if (filters.frequency) {
      filterConditions.push(collection.filter.byProperty('frequency').equal(filters.frequency));
    }

    if (filters.hasMinimalRepro !== undefined) {
      filterConditions.push(
        collection.filter.byProperty('hasMinimalRepro').equal(filters.hasMinimalRepro)
      );
    }

    if (filters.rootCause) {
      filterConditions.push(collection.filter.byProperty('rootCause').equal(filters.rootCause));
    }

    if (filters.fixType) {
      filterConditions.push(collection.filter.byProperty('fixType').equal(filters.fixType));
    }

    if (filters.complexity) {
      filterConditions.push(collection.filter.byProperty('complexity').equal(filters.complexity));
    }

    if (filters.relatedPatterns && filters.relatedPatterns.length > 0) {
      filterConditions.push(
        collection.filter.byProperty('relatedPatterns').containsAny(filters.relatedPatterns)
      );
    }

    if (filterConditions.length === 1) {
      return filterConditions[0];
    }

    return Filters.and(...filterConditions);
  }

  private async vectorSearch(
    query: string,
    filters: WeaviateFilter,
    limit: number,
    offset: number
  ): Promise<SearchResult[]> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return [];

    const startTime = Date.now();
    try {
      const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);
      const filter = this.buildWeaviateFilter(filters);

      const results = await collection.query.nearText(query, {
        limit,
        offset,
        filters: filter ?? undefined,
        targetVector: collection.multiTargetVector.manualWeights({
          titleVec: 0.4,
          summaryVec: 0.6,
        }),
        returnMetadata: ['distance'],
      });

      trackSuccess(OPERATIONS.WEAVIATE_SEARCH, Date.now() - startTime, {
        hasFilters: String(!!filter),
      });
      return this.buildSearchResultsFromWeaviate(
        results.objects,
        obj => 1 - (obj.metadata?.distance ?? 0)
      );
    } catch (err) {
      logger.logError('Vector search failed', err, { queryLength: query.length, limit });
      trackError(OPERATIONS.WEAVIATE_SEARCH, 'WEAVIATE_ERROR');
      return [];
    }
  }

  private async hybridSearch(
    query: string,
    filters: WeaviateFilter,
    limit: number,
    offset: number
  ): Promise<SearchResult[]> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return [];

    const startTime = Date.now();
    try {
      const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);
      const filter = this.buildWeaviateFilter(filters);

      const results = await collection.query.hybrid(query, {
        alpha: HYBRID_ALPHA,
        fusionType: 'RelativeScore',
        maxVectorDistance: MAX_VECTOR_DISTANCE,
        queryProperties: [{ name: 'title', weight: 2 }, 'content'],
        targetVector: collection.multiTargetVector.manualWeights({
          titleVec: 0.4,
          summaryVec: 0.6,
        }),
        rerank: { property: 'title', query },
        limit,
        offset,
        filters: filter ?? undefined,
        returnMetadata: ['score', 'rerankScore'],
      });

      trackSuccess(OPERATIONS.WEAVIATE_SEARCH, Date.now() - startTime, {
        hasFilters: String(!!filter),
        searchMethod: 'hybrid',
      });
      return this.buildSearchResultsFromWeaviate(results.objects, obj => {
        const raw = obj.metadata?.rerankScore ?? obj.metadata?.score ?? 0;
        // rerankScore is a raw cross-encoder logit (unbounded); normalize to [0,1] via sigmoid
        return obj.metadata?.rerankScore != null ? 1 / (1 + Math.exp(-raw)) : raw;
      });
    } catch (err) {
      logger.logError('Hybrid search failed', err, { queryLength: query.length, limit });
      trackError(OPERATIONS.WEAVIATE_SEARCH, 'WEAVIATE_HYBRID_ERROR');
      return [];
    }
  }

  private logSearchEvent(
    organizationId: string | undefined,
    query: string,
    resultCount: number,
    searchType: string | undefined
  ): void {
    const { db } = this.deps;
    db.insert(searchEvents)
      .values({ organizationId: organizationId ?? null, query, resultCount, searchType })
      .catch(err => logger.logError('Failed to log search event', err));
  }

  private publicOrgId: string | null | undefined = undefined;

  private async buildSearchResultsFromWeaviate(
    objects: Array<{
      properties: SolutionVector;
      metadata?: { distance?: number; score?: number; rerankScore?: number };
    }>,
    getScore: (obj: {
      properties: SolutionVector;
      metadata?: { distance?: number; score?: number; rerankScore?: number };
    }) => number
  ): Promise<SearchResult[]> {
    if (objects.length === 0) return [];

    const descriptionsByIssueId = await this.getIssueDescriptionMap(
      objects.map(obj => obj.properties.issueId)
    );

    return objects.map(obj =>
      buildSearchResultFromWeaviate(
        obj.properties,
        getScore(obj),
        descriptionsByIssueId.get(obj.properties.issueId) ?? ''
      )
    );
  }

  private async getIssueDescriptionMap(issueIds: string[]): Promise<Map<string, string>> {
    const uniqueIssueIds = [...new Set(issueIds)];
    if (uniqueIssueIds.length === 0) return new Map();

    const { db } = this.deps;
    const issueRows = await db
      .select({ id: issues.id, description: issues.description })
      .from(issues)
      .where(inArray(issues.id, uniqueIssueIds));

    return new Map(issueRows.map(issue => [issue.id, issue.description]));
  }

  private settingsCache = new LRUCache<string, Required<OrganizationSettings>>({
    max: 500,
    ttl: 60_000,
  });

  private async getPublicOrgId(): Promise<string | null> {
    if (this.publicOrgId !== undefined) return this.publicOrgId;

    const { db } = this.deps;
    const [publicOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.isPublic, true))
      .limit(1);

    this.publicOrgId = publicOrg?.id ?? null;
    return this.publicOrgId;
  }

  async getOrgSettings(organizationId: string): Promise<Required<OrganizationSettings>> {
    const cached = this.settingsCache.get(organizationId);
    if (cached) return cached;

    const { db } = this.deps;
    const [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const resolved = resolveOrgSettings(row?.settings as OrganizationSettings | null);
    this.settingsCache.set(organizationId, resolved);
    return resolved;
  }

  invalidateSettingsCache(organizationId: string): void {
    this.settingsCache.delete(organizationId);
  }

  private async getAccessibleOrganizationIds(organizationId: string): Promise<string[]> {
    const settings = await this.getOrgSettings(organizationId);

    if (settings.searchScope === 'org_only') {
      return [organizationId];
    }

    if (settings.searchScope === 'domain_orgs') {
      const { db } = this.deps;
      const [org] = await db
        .select({ domainId: organizations.domainId })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (org?.domainId) {
        const domainOrgs = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.domainId, org.domainId));
        return domainOrgs.map(o => o.id);
      }
      return [organizationId];
    }

    // 'org_and_public' — default behavior
    const publicOrgId = await this.getPublicOrgId();
    const orgIds = [organizationId];
    if (publicOrgId && publicOrgId !== organizationId) {
      orgIds.push(publicOrgId);
    }
    return orgIds;
  }

  async getIssueDetail(issueId: string, organizationId: string) {
    const { db } = this.deps;
    const accessibleOrgIds = await this.getAccessibleOrganizationIds(organizationId);

    const [issueRow] = await db
      .select({
        id: issues.id,
        title: issues.title,
        description: issues.description,
        authorId: issues.authorId,
        solutionCount: issues.solutionCount,
        acceptedSolutionId: issues.acceptedSolutionId,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        errorType: issues.errorType,
        severity: issues.severity,
        environment: issues.environment,
        affectedArea: issues.affectedArea,
        rootCause: issues.rootCause,
        complexity: issues.complexity,
        packages: issues.packages,
        techStack: issues.techStack,
        project: issues.project,
        frequency: issues.frequency,
        fixType: issues.fixType,
        hasMinimalRepro: issues.hasMinimalRepro,
        timeToResolve: issues.timeToResolve,
        originOrganizationId: issues.originOrganizationId,
        authorName: users.name,
        agentSlug: agents.slug,
        agentDisplayName: agents.displayName,
      })
      .from(issues)
      .innerJoin(users, eq(issues.authorId, users.id))
      .leftJoin(agents, eq(issues.authorAgentId, agents.id))
      .where(and(eq(issues.id, issueId), inArray(issues.organizationId, accessibleOrgIds)))
      .limit(1);

    if (!issueRow) return null;

    const issueTags_ = await db
      .select({ id: tags.id, name: tags.name })
      .from(issueTags)
      .innerJoin(tags, eq(issueTags.tagId, tags.id))
      .where(eq(issueTags.issueId, issueId));

    const solutionRows = await db
      .select({
        id: solutions.id,
        issueId: solutions.issueId,
        authorId: solutions.authorId,
        content: solutions.content,
        voteCount: solutions.voteCount,
        commentCount: solutions.commentCount,
        isAccepted: solutions.isAccepted,
        createdAt: solutions.createdAt,
        updatedAt: solutions.updatedAt,
        authorName: users.name,
        agentSlug: agents.slug,
        agentDisplayName: agents.displayName,
      })
      .from(solutions)
      .innerJoin(users, eq(solutions.authorId, users.id))
      .leftJoin(agents, eq(solutions.authorAgentId, agents.id))
      .where(
        and(
          eq(solutions.issueId, issueId),
          eq(solutions.status, 'approved'),
          isNull(solutions.deletedAt)
        )
      )
      .orderBy(desc(solutions.isAccepted), desc(solutions.voteCount));

    const solutionIds = solutionRows.map(s => s.id);
    const commentRows =
      solutionIds.length > 0
        ? await db
            .select({
              id: comments.id,
              solutionId: comments.solutionId,
              authorId: comments.authorId,
              content: comments.content,
              createdAt: comments.createdAt,
              updatedAt: comments.updatedAt,
              authorName: users.name,
              agentSlug: agents.slug,
              agentDisplayName: agents.displayName,
            })
            .from(comments)
            .innerJoin(users, eq(comments.authorId, users.id))
            .leftJoin(agents, eq(comments.authorAgentId, agents.id))
            .where(and(inArray(comments.solutionId, solutionIds), isNull(comments.deletedAt)))
            .orderBy(asc(comments.createdAt))
        : [];

    const commentsBySolution = new Map<string, typeof commentRows>();
    for (const c of commentRows) {
      const arr = commentsBySolution.get(c.solutionId) ?? [];
      arr.push(c);
      commentsBySolution.set(c.solutionId, arr);
    }

    return {
      issue: {
        id: issueRow.id,
        title: issueRow.title,
        summary: buildIssueSummary(issueRow.description),
        description: issueRow.description,
        authorId: issueRow.authorId,
        solutionCount: issueRow.solutionCount,
        acceptedSolutionId: issueRow.acceptedSolutionId,
        createdAt: issueRow.createdAt.toISOString(),
        updatedAt: issueRow.updatedAt.toISOString(),
        errorType: issueRow.errorType,
        severity: issueRow.severity,
        environment: issueRow.environment,
        affectedArea: issueRow.affectedArea,
        rootCause: issueRow.rootCause,
        complexity: issueRow.complexity,
        packages: issueRow.packages,
        techStack: issueRow.techStack,
        project: issueRow.project,
        frequency: issueRow.frequency,
        fixType: issueRow.fixType,
        hasMinimalRepro: issueRow.hasMinimalRepro,
        timeToResolve: issueRow.timeToResolve,
        originOrganizationId: issueRow.originOrganizationId,
        tags: issueTags_,
        author: {
          id: issueRow.authorId,
          name: issueRow.authorName,
        },
        authorAgent: issueRow.agentSlug
          ? { slug: issueRow.agentSlug, displayName: issueRow.agentDisplayName! }
          : null,
      },
      solutions: solutionRows.map(s => ({
        id: s.id,
        issueId: s.issueId,
        authorId: s.authorId,
        content: s.content,
        voteCount: s.voteCount,
        commentCount: s.commentCount,
        isAccepted: s.isAccepted,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        author: {
          id: s.authorId,
          name: s.authorName,
        },
        authorAgent: s.agentSlug ? { slug: s.agentSlug, displayName: s.agentDisplayName! } : null,
        comments: (commentsBySolution.get(s.id) ?? []).map(c => ({
          id: c.id,
          solutionId: c.solutionId,
          authorId: c.authorId,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          author: {
            id: c.authorId,
            name: c.authorName,
          },
          authorAgent: c.agentSlug ? { slug: c.agentSlug, displayName: c.agentDisplayName! } : null,
        })),
      })),
    };
  }

  async search(input: SearchInput, organizationId: string): Promise<SearchResponse> {
    const startTime = Date.now();
    const { query, search_type } = input;

    try {
      const accessibleOrgIds = await this.getAccessibleOrganizationIds(organizationId);
      const searchOrgIds = input.excludePublicOrg ? [organizationId] : accessibleOrgIds;

      const weaviateFilters: WeaviateFilter = {
        organizationIds: searchOrgIds,
        tags: input.tags?.map(normalizeTag),
        project: input.project,
        techStack: input.techStack,
        packageNames: input.packages?.map(p => p.name),
        errorType: input.errorType,
        severity: input.severity,
        environment: input.environment,
        fileTypes: input.fileTypes,
        codePatterns: input.codePatterns,
        affectedArea: input.affectedArea,
        frequency: input.frequency,
        hasMinimalRepro: input.hasMinimalRepro,
        rootCause: input.rootCause,
        fixType: input.fixType,
        complexity: input.maxComplexity,
        relatedPatterns: input.relatedPatterns,
      };

      if (query) {
        return await this.weaviateSearchPath(
          query,
          input,
          search_type === 'hybrid',
          weaviateFilters,
          startTime
        );
      }

      return await this.weaviateBrowsePath(input, weaviateFilters, startTime);
    } catch (err) {
      logger.logError('Search failed', err, { organizationId, searchType: search_type });
      trackError(OPERATIONS.SEARCH_QUERY, 'SEARCH_ERROR');
      throw err;
    }
  }

  private async weaviateSearchPath(
    query: string,
    input: SearchInput,
    useHybrid: boolean,
    weaviateFilters: WeaviateFilter,
    startTime: number
  ): Promise<SearchResponse> {
    const { sort_order, limit, offset } = input;
    const isRelevanceSort = !sort_order || sort_order === 'relevance';

    // Hybrid search uses autoLimit (autocut), which is incompatible with Weaviate-side offset:
    // autocut evaluates score jumps only within the fetched window, so passing offset skips the
    // high-score results that autocut needs to establish the cutoff boundary.
    // Fix: hybrid always fetches from offset 0 and paginates in memory.
    // Vector search has no autocut, so it can pass offset directly to Weaviate.
    const useWeaviateOffset = !useHybrid && isRelevanceSort;
    const fetchLimit = isRelevanceSort
      ? useWeaviateOffset
        ? limit + 1
        : offset + limit + 1
      : Math.max(offset + limit + 1, MIN_CANDIDATE_POOL);
    const fetchOffset = useWeaviateOffset ? offset : 0;

    const candidates = useHybrid
      ? await this.hybridSearch(query, weaviateFilters, fetchLimit, 0)
      : await this.vectorSearch(query, weaviateFilters, fetchLimit, fetchOffset);

    const minScore = input.minRelevance ?? (useHybrid ? 0 : RELEVANCE_THRESHOLD);
    let results = candidates.filter(r => (r.relevance ?? 0) >= minScore);

    if (input.packages && input.packages.length > 0) {
      results = filterByPackageVersionsFromResults(results, input.packages);
    }

    results = sortResults(results, sort_order);

    const hasMore = useWeaviateOffset ? results.length > limit : results.length > offset + limit;

    results = useWeaviateOffset ? results.slice(0, limit) : results.slice(offset, offset + limit);

    const durationMs = Date.now() - startTime;
    logger.info('Search completed successfully', {
      searchType: input.search_type,
      searchMethod: useHybrid ? 'weaviate-hybrid' : 'weaviate-vector',
      sortOrder: sort_order,
      resultCount: results.length,
      candidatePoolSize: candidates.length,
      durationMs,
    });
    trackSuccess(OPERATIONS.SEARCH_QUERY, durationMs, { searchType: input.search_type });

    this.logSearchEvent(
      weaviateFilters.organizationIds[0],
      query,
      results.length,
      input.search_type
    );

    return { results, sort_order: sort_order ?? 'relevance', hasMore };
  }

  private async weaviateBrowsePath(
    input: SearchInput,
    weaviateFilters: WeaviateFilter,
    startTime: number
  ): Promise<SearchResponse> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient)
      return { results: [], sort_order: input.sort_order ?? 'relevance', hasMore: false };

    const { sort_order, limit, offset } = input;

    try {
      const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);
      const filter = this.buildWeaviateFilter(weaviateFilters);

      const sort = buildWeaviateSort(collection, sort_order);

      const fetchResult = await collection.query.fetchObjects({
        filters: filter ?? undefined,
        sort,
        limit: limit + 1,
        offset,
      });

      const hasMore = fetchResult.objects.length > limit;
      const objects = hasMore ? fetchResult.objects.slice(0, limit) : fetchResult.objects;
      const results = await this.buildSearchResultsFromWeaviate(objects, () => 0);

      const durationMs = Date.now() - startTime;
      logger.info('Browse completed successfully', {
        searchMethod: 'weaviate-browse',
        sortOrder: sort_order,
        resultCount: results.length,
        hasMore,
        durationMs,
      });
      trackSuccess(OPERATIONS.SEARCH_QUERY, durationMs, { searchType: 'browse' });

      return { results, sort_order: sort_order ?? 'relevance', hasMore };
    } catch (err) {
      logger.logError('Weaviate browse failed', err, { sortOrder: sort_order });
      trackError(OPERATIONS.SEARCH_QUERY, 'WEAVIATE_BROWSE_ERROR');
      return { results: [], sort_order: sort_order ?? 'relevance', hasMore: false };
    }
  }

  async getFacets(organizationId: string): Promise<FacetsResult> {
    const { weaviateClient } = this.deps;

    if (!weaviateClient) {
      return this.getFacetsFromPg(organizationId);
    }

    try {
      const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);
      const accessibleOrgIds = await this.getAccessibleOrganizationIds(organizationId);
      const orgFilter = collection.filter
        .byProperty('organizationId')
        .containsAny(accessibleOrgIds);

      const aggFor = (prop: keyof SolutionVector) =>
        collection.aggregate.overAll({
          filters: orgFilter,
          returnMetrics: collection.metrics
            .aggregate(prop)
            .text(['topOccurrencesValue', 'topOccurrencesOccurs']),
        });

      const [
        projectAgg,
        techStackAgg,
        tagsAgg,
        errorTypeAgg,
        severityAgg,
        environmentAgg,
        affectedAreaAgg,
        frequencyAgg,
        rootCauseAgg,
        fixTypeAgg,
        complexityAgg,
      ] = await Promise.all([
        aggFor('project'),
        aggFor('techStack'),
        aggFor('tags'),
        aggFor('errorType'),
        aggFor('severity'),
        aggFor('environment'),
        aggFor('affectedArea'),
        aggFor('frequency'),
        aggFor('rootCause'),
        aggFor('fixType'),
        aggFor('complexity'),
      ]);

      return {
        projects: extractTopOccurrences(projectAgg, 'project', 50),
        techStack: extractTopOccurrences(techStackAgg, 'techStack', 100),
        tags: extractTopOccurrences(tagsAgg, 'tags', 100),
        errorTypes: extractTopOccurrences(errorTypeAgg, 'errorType', 50),
        severities: extractTopOccurrences(severityAgg, 'severity', 10),
        environments: extractTopOccurrences(environmentAgg, 'environment', 20),
        affectedAreas: extractTopOccurrences(affectedAreaAgg, 'affectedArea', 50),
        frequencies: extractTopOccurrences(frequencyAgg, 'frequency', 10),
        rootCauses: extractTopOccurrences(rootCauseAgg, 'rootCause', 50),
        fixTypes: extractTopOccurrences(fixTypeAgg, 'fixType', 50),
        complexities: extractTopOccurrences(complexityAgg, 'complexity', 10),
      };
    } catch (err) {
      logger.logError('Weaviate aggregate failed, falling back to PG', err);
      return this.getFacetsFromPg(organizationId);
    }
  }

  private async getFacetsFromPg(organizationId: string): Promise<FacetsResult> {
    const { db } = this.deps;
    const accessibleOrgIds = await this.getAccessibleOrganizationIds(organizationId);
    const orgFilter = inArray(issues.organizationId, accessibleOrgIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const distinctField = (column: any) =>
      db
        .selectDistinct({ v: column })
        .from(issues)
        .where(and(orgFilter, sql`${column} IS NOT NULL`))
        .orderBy(asc(column))
        .limit(50);

    const [
      projectRows,
      techStackRows,
      tagRows,
      errorTypeRows,
      severityRows,
      environmentRows,
      affectedAreaRows,
      frequencyRows,
      rootCauseRows,
      fixTypeRows,
      complexityRows,
    ] = await Promise.all([
      distinctField(issues.project),

      db
        .select({ t: sql<string>`unnest(${issues.techStack})` })
        .from(issues)
        .where(and(orgFilter, sql`${issues.techStack} IS NOT NULL`))
        .groupBy(sql`unnest(${issues.techStack})`)
        .orderBy(sql`count(*) DESC`)
        .limit(100),

      db
        .select({ name: tags.name })
        .from(tags)
        .innerJoin(issueTags, eq(issueTags.tagId, tags.id))
        .innerJoin(issues, eq(issueTags.issueId, issues.id))
        .where(orgFilter)
        .groupBy(tags.id, tags.name, tags.usageCount)
        .orderBy(desc(tags.usageCount))
        .limit(100),

      distinctField(issues.errorType),
      distinctField(issues.severity),
      distinctField(issues.environment),
      distinctField(issues.affectedArea),
      distinctField(issues.frequency),
      distinctField(issues.rootCause),
      distinctField(issues.fixType),
      distinctField(issues.complexity),
    ]);

    const toStrings = (rows: { v: string | null }[]) =>
      rows.map(r => r.v).filter((v): v is string => v !== null);

    return {
      projects: toStrings(projectRows),
      techStack: techStackRows.map(r => r.t),
      tags: tagRows.map(r => r.name),
      errorTypes: toStrings(errorTypeRows),
      severities: toStrings(severityRows),
      environments: toStrings(environmentRows),
      affectedAreas: toStrings(affectedAreaRows),
      frequencies: toStrings(frequencyRows),
      rootCauses: toStrings(rootCauseRows),
      fixTypes: toStrings(fixTypeRows),
      complexities: toStrings(complexityRows),
    };
  }
}

function sortResults(results: SearchResult[], sortOrder: string | undefined): SearchResult[] {
  const sorted = [...results];
  switch (sortOrder) {
    case 'votes':
      sorted.sort((a, b) => b.votes - a.votes);
      break;
    case 'recent':
      sorted.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      break;
    default:
      sorted.sort((a, b) => (b.rank_score ?? 0) - (a.rank_score ?? 0));
  }
  return sorted;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildWeaviateSort(collection: any, sortOrder: string | undefined) {
  switch (sortOrder) {
    case 'votes':
      return collection.sort.byProperty('voteCount', false);
    case 'recent':
      return collection.sort.byProperty('createdAt', false);
    case 'severity':
      return collection.sort.byProperty('severityOrder', true).byProperty('voteCount', false);
    case 'complexity':
      return collection.sort.byProperty('complexityOrder', true).byProperty('voteCount', false);
    default:
      return collection.sort.byProperty('voteCount', false).byProperty('createdAt', false);
  }
}

function buildSearchResultFromWeaviate(
  p: SolutionVector,
  score: number,
  issueDescription: string
): SearchResult {
  const trustLevel = (p.authorTrustLevel as TrustLevel) ?? 'new';
  return {
    solution_id: p.solutionId,
    issue_id: p.issueId,
    title: p.title,
    summary: buildIssueSummary(issueDescription),
    votes: p.voteCount,
    timestamp: toISOString(p.issueCreatedAt ?? p.createdAt),
    tags: p.tags ?? [],
    author_name: p.agentDisplayName ?? p.authorName,
    author_agent_slug: p.agentSlug,
    author_agent_name: p.agentDisplayName,
    organization_name: p.organizationName,
    is_accepted: p.isAccepted ?? false,
    author_trust_level: trustLevel,
    relevance: score,
    rank_score: computeRankScore(score, p.voteCount, p.isAccepted ?? false, trustLevel),
    metadata: {
      project: p.project,
      techStack: p.techStack,
      errorType: p.errorType,
      severity: p.severity,
      complexity: p.complexity,
      environment: p.environment,
      affectedArea: p.affectedArea,
      frequency: p.frequency,
      rootCause: p.rootCause,
      fixType: p.fixType,
      hasMinimalRepro: p.hasMinimalRepro,
      fileTypes: p.fileTypes,
      codePatterns: p.codePatterns,
      relatedPatterns: p.relatedPatterns,
    },
  };
}

function toISOString(date: Date | string): string {
  return date instanceof Date ? date.toISOString() : String(date);
}

function buildIssueSummary(description: string): string {
  const plainText = description
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plainText.length <= 200) return plainText;
  return plainText.slice(0, 200).trimEnd() + '...';
}

// TODO: Package version filtering from Weaviate results requires parsing
// packageVersions strings (e.g. "react@18.2.0") back into {name, version} pairs.
// For now, packageNames are pre-filtered in Weaviate via buildWeaviateFilter.
function filterByPackageVersionsFromResults(
  results: SearchResult[],
  _packages: PackageFilter[]
): SearchResult[] {
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTopOccurrences(aggResult: any, propertyName: string, limit: number): string[] {
  const topOccurrences = aggResult?.properties?.[propertyName]?.topOccurrences;
  if (!Array.isArray(topOccurrences)) return [];
  return topOccurrences
    .filter((o: { value: string }) => o.value)
    .slice(0, limit)
    .map((o: { value: string }) => o.value);
}
