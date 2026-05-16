import { eq, and, or, sql, desc, ilike, inArray, isNull } from 'drizzle-orm';
import {
  agents,
  apiKeys,
  agentBadges,
  users,
  organizationMembers,
  organizations,
  solutions,
  issues,
  issueTags,
  tags,
  comments,
  wikiPages,
  wikiPageHistory,
  wikiLog,
  rawSources,
} from '@agent-in-sync/db-client';
import type { CreateAgentInput, UpdateAgentInput } from '@agent-in-sync/shared';
import { TRUST_RANK } from '@agent-in-sync/shared';
import type { ServiceDependencies } from './dependencies.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors/index.js';

type AgentProfileStats = {
  totalIssues: number;
  totalSolutions: number;
  totalComments: number;
  totalAcceptedSolutions: number;
  totalUpvotes: number;
  bestTrustLevel: string;
  activeOrganizations: number;
  totalWikiPagesCreated: number;
  totalWikiEdits: number;
  totalSourcesIngested: number;
};

type ApiKeyInfo = {
  id: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

type AgentProfile = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  organizationId: string;
  isPublic: boolean;
  isRestricted?: boolean;
  badgeCount: number;
  connectedUser: { id: string; name: string | null } | null;
  createdByUser: { id: string; name: string | null; image: string | null } | null;
  organizationName: string | null;
  badges: Array<{
    badgeId: string;
    earnedAt: string;
    metadata: Record<string, unknown> | null;
  }>;
  stats: AgentProfileStats;
  isCreator: boolean;
  apiKeyInfo: ApiKeyInfo | null;
  createdAt: string;
  updatedAt: string;
};

type AgentIssue = {
  id: string;
  title: string;
  description: string;
  solutionCount: number;
  tags: string[];
  createdAt: string;
};

type AgentWikiPage = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  voteCount: number;
  editCount: number;
  version: number;
  role: 'creator' | 'editor';
  updatedAt: string;
  createdAt: string;
};

export class AgentService {
  private publicOrgId: string | null | undefined = undefined;

  constructor(private deps: ServiceDependencies) {}

  private async getPublicOrgId(): Promise<string | null> {
    if (this.publicOrgId !== undefined) return this.publicOrgId;
    const [publicOrg] = await this.deps.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.isPublic, true))
      .limit(1);
    const id = publicOrg?.id ?? null;
    this.publicOrgId = id;
    return id;
  }

  /** Creates a new agent profile and links the calling API key to it. */
  async createAgent(
    input: CreateAgentInput,
    userId: string,
    organizationId: string,
    apiKeyId?: string
  ): Promise<AgentProfile> {
    const { db } = this.deps;

    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, input.slug))
      .limit(1);

    if (existing) {
      throw new ConflictError('An agent with this slug already exists');
    }

    if (apiKeyId) {
      const [key] = await db
        .select({ agentId: apiKeys.agentId })
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);

      if (key?.agentId) {
        throw new ConflictError('This API key is already linked to an agent');
      }
    }

    const agent = await db.transaction(async tx => {
      const [txAgent] = await tx
        .insert(agents)
        .values({
          slug: input.slug,
          displayName: input.displayName,
          bio: input.bio,
          avatarUrl: input.avatarUrl,
          website: input.website,
          githubUrl: input.githubUrl,
          linkedinUrl: input.linkedinUrl,
          createdByUserId: userId,
          organizationId,
          isPublic: input.isPublic ?? false,
        })
        .returning();

      if (apiKeyId) {
        await tx.update(apiKeys).set({ agentId: txAgent!.id }).where(eq(apiKeys.id, apiKeyId));
      }

      return txAgent!;
    });

    return this.buildProfile(agent, [], userId);
  }

  /** Gets an agent profile by slug. Private agents return a minimal restricted profile. */
  async getAgentBySlug(
    slug: string,
    requestingUserId?: string,
    requestingOrgId?: string
  ): Promise<AgentProfile> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);

    if (!agent) {
      throw new NotFoundError('Agent');
    }

    const hasAccess = await this.checkVisibility(agent, requestingUserId, requestingOrgId);

    if (!hasAccess) {
      return this.buildRestrictedProfile(agent);
    }

    const badges = await this.fetchBadges(agent.id);
    return this.buildProfile(agent, badges, requestingUserId);
  }

  /** Updates an agent profile. Only the creator, connected user, or the agent itself can update. */
  async updateAgent(
    slug: string,
    input: UpdateAgentInput,
    userId: string,
    requestingAgentId?: string
  ): Promise<AgentProfile> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);

    if (!agent) {
      throw new NotFoundError('Agent');
    }

    const isSelfUpdate = requestingAgentId && agent.id === requestingAgentId;
    if (!isSelfUpdate && agent.createdByUserId !== userId && agent.connectedUserId !== userId) {
      throw new ForbiddenError('Only the agent owner can update this profile');
    }

    const [updated] = await db
      .update(agents)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(agents.id, agent.id))
      .returning();

    const badges = await this.fetchBadges(updated!.id);
    return this.buildProfile(updated!, badges, userId);
  }

  /** Deletes an agent profile. Only the creator can delete. */
  async deleteAgent(slug: string, userId: string): Promise<void> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);

    if (!agent) {
      throw new NotFoundError('Agent');
    }

    if (agent.createdByUserId !== userId) {
      throw new ForbiddenError('Only the agent creator can delete this profile');
    }

    await db.delete(agents).where(eq(agents.id, agent.id));
  }

  /** Connects a human user to an agent profile. */
  async connectHuman(slug: string, userId: string): Promise<AgentProfile> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);

    if (!agent) {
      throw new NotFoundError('Agent');
    }

    if (agent.createdByUserId !== userId) {
      throw new ForbiddenError('Only the agent creator can connect a human operator');
    }

    const [updated] = await db
      .update(agents)
      .set({ connectedUserId: userId, updatedAt: new Date() })
      .where(eq(agents.id, agent.id))
      .returning();

    const badges = await this.fetchBadges(updated!.id);
    return this.buildProfile(updated!, badges, userId);
  }

  /** Links an existing API key to an agent. */
  async linkApiKey(slug: string, apiKeyId: string, userId: string): Promise<void> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!agent) throw new NotFoundError('Agent');
    if (agent.createdByUserId !== userId) {
      throw new ForbiddenError('Only the agent creator can link API keys');
    }

    const [key] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!key) throw new NotFoundError('API key');

    await db.update(apiKeys).set({ agentId: agent.id }).where(eq(apiKeys.id, apiKeyId));
  }

  /** Lists agents visible to the requesting user within an org, plus public agents. */
  async listAgents(
    _requestingUserId?: string,
    requestingOrgId?: string,
    options: { limit?: number; offset?: number; search?: string } = {}
  ): Promise<{ agents: AgentProfile[]; total: number }> {
    const { db } = this.deps;
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    const publicOrgId = await this.getPublicOrgId();
    const orgConditions = [eq(agents.isPublic, true)];
    if (requestingOrgId) orgConditions.push(eq(agents.organizationId, requestingOrgId));
    if (publicOrgId && publicOrgId !== requestingOrgId) {
      orgConditions.push(eq(agents.organizationId, publicOrgId));
    }
    const visibilityCondition = or(...orgConditions);

    const searchTerm = options.search?.trim();
    const pattern = searchTerm ? `%${searchTerm}%` : undefined;

    const searchCondition = pattern
      ? or(
          ilike(agents.displayName, pattern),
          ilike(agents.slug, pattern),
          ilike(agents.bio, pattern),
          ilike(organizations.name, pattern),
          sql`EXISTS (SELECT 1 FROM "users" u WHERE u.id = ${agents.connectedUserId} AND u.name ILIKE ${pattern})`,
          sql`EXISTS (SELECT 1 FROM "users" u WHERE u.id = ${agents.createdByUserId} AND u.name ILIKE ${pattern})`
        )
      : undefined;

    const where = searchCondition ? and(visibilityCondition, searchCondition) : visibilityCondition;

    if (pattern) {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .leftJoin(organizations, eq(agents.organizationId, organizations.id))
        .where(where);

      const rows = await db
        .select({ agent: agents })
        .from(agents)
        .leftJoin(organizations, eq(agents.organizationId, organizations.id))
        .where(where)
        .orderBy(desc(agents.createdAt))
        .limit(limit)
        .offset(offset);

      const profiles = await Promise.all(rows.map(row => this.buildProfile(row.agent, [])));
      return { agents: profiles, total: countResult?.count ?? 0 };
    }

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(where);

    const rows = await db
      .select()
      .from(agents)
      .where(where)
      .orderBy(desc(agents.createdAt))
      .limit(limit)
      .offset(offset);

    const profiles = await Promise.all(rows.map(row => this.buildProfile(row, [])));
    return { agents: profiles, total: countResult?.count ?? 0 };
  }

  /** Gets recent activity (solutions and comments) for an agent. */
  async getAgentActivity(
    slug: string,
    requestingUserId?: string,
    requestingOrgId?: string,
    options: { limit?: number; offset?: number; isSuperAdmin?: boolean } = {}
  ) {
    const { db } = this.deps;
    const limit = Math.min(options.limit ?? 20, 50);
    const offset = options.offset ?? 0;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!agent) throw new NotFoundError('Agent');

    await this.enforceVisibility(agent, requestingUserId, requestingOrgId, options.isSuperAdmin);

    const linkedKeyIds = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.agentId, agent.id));

    const keyIds = linkedKeyIds.map(k => k.id);

    const recentSolutions =
      keyIds.length > 0
        ? await db
            .select({
              id: solutions.id,
              issueId: solutions.issueId,
              content: solutions.content,
              isAccepted: solutions.isAccepted,
              voteCount: solutions.voteCount,
              createdAt: solutions.createdAt,
            })
            .from(solutions)
            .where(and(inArray(solutions.authorApiKeyId, keyIds), isNull(solutions.deletedAt)))
            .orderBy(desc(solutions.createdAt))
        : [];

    const recentComments =
      keyIds.length > 0
        ? await db
            .select({
              id: comments.id,
              solutionId: comments.solutionId,
              content: comments.content,
              createdAt: comments.createdAt,
            })
            .from(comments)
            .where(and(inArray(comments.authorApiKeyId, keyIds), isNull(comments.deletedAt)))
            .orderBy(desc(comments.createdAt))
        : [];

    // Look up issueId for each comment via its solution
    const commentSolutionIds = [...new Set(recentComments.map(c => c.solutionId))];
    const solutionIssueMap = new Map<string, string>();
    if (commentSolutionIds.length > 0) {
      const solutionRows = await db
        .select({ id: solutions.id, issueId: solutions.issueId })
        .from(solutions)
        .where(inArray(solutions.id, commentSolutionIds));
      for (const row of solutionRows) {
        solutionIssueMap.set(row.id, row.issueId);
      }
    }

    // Fetch wiki activity for this agent
    const recentWikiActivity = await db
      .select({
        id: wikiLog.id,
        operation: wikiLog.operation,
        summary: wikiLog.summary,
        relatedPageIds: wikiLog.relatedPageIds,
        createdAt: wikiLog.createdAt,
      })
      .from(wikiLog)
      .where(eq(wikiLog.agentId, agent.id))
      .orderBy(desc(wikiLog.createdAt));

    // Resolve wiki page slugs for linking
    const allPageIds = recentWikiActivity.flatMap(w => w.relatedPageIds ?? []);
    const uniquePageIds = [...new Set(allPageIds)];
    const pageSlugMap = new Map<string, string>();
    if (uniquePageIds.length > 0) {
      const pageRows = await db
        .select({ id: wikiPages.id, slug: wikiPages.slug })
        .from(wikiPages)
        .where(inArray(wikiPages.id, uniquePageIds));
      for (const row of pageRows) {
        pageSlugMap.set(row.id, row.slug);
      }
    }

    type ActivityItem = {
      type:
        | 'solution'
        | 'comment'
        | 'wiki_page_created'
        | 'wiki_page_updated'
        | 'wiki_source_ingested';
      id: string;
      issueId?: string;
      wikiPageSlug?: string;
      preview: string;
      isAccepted: boolean;
      voteCount: number;
      createdAt: string;
    };

    const wikiOperationToType: Record<string, ActivityItem['type']> = {
      page_created: 'wiki_page_created',
      page_updated: 'wiki_page_updated',
      ingest: 'wiki_source_ingested',
    };

    const allActivity: ActivityItem[] = [
      ...recentSolutions.map(s => ({
        type: 'solution' as const,
        id: s.id,
        issueId: s.issueId,
        preview: s.content.slice(0, 200),
        isAccepted: s.isAccepted,
        voteCount: s.voteCount,
        createdAt: s.createdAt.toISOString(),
      })),
      ...recentComments
        .filter(c => solutionIssueMap.has(c.solutionId))
        .map(c => ({
          type: 'comment' as const,
          id: c.id,
          issueId: solutionIssueMap.get(c.solutionId)!,
          preview: c.content.slice(0, 200),
          isAccepted: false,
          voteCount: 0,
          createdAt: c.createdAt.toISOString(),
        })),
      ...recentWikiActivity
        .filter(w => wikiOperationToType[w.operation])
        .map(w => ({
          type: wikiOperationToType[w.operation]!,
          id: w.id,
          wikiPageSlug: w.relatedPageIds?.[0] ? pageSlugMap.get(w.relatedPageIds[0]) : undefined,
          preview: w.summary.slice(0, 200),
          isAccepted: false,
          voteCount: 0,
          createdAt: w.createdAt.toISOString(),
        })),
    ];

    allActivity.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = allActivity.length;
    const page = allActivity.slice(offset, offset + limit);

    return { activity: page, total };
  }

  /** Returns a unified agent entity: profile + recent issues + recent activity + recent wiki pages. */
  async getAgentEntity(slug: string, requestingUserId?: string, requestingOrgId?: string) {
    const [profile, issuesResult, activityResult, wikiResult] = await Promise.all([
      this.getAgentBySlug(slug, requestingUserId, requestingOrgId),
      this.getAgentIssues(slug, requestingUserId, requestingOrgId, { limit: 10 }),
      this.getAgentActivity(slug, requestingUserId, requestingOrgId, { limit: 10 }),
      this.getAgentWikiPages(slug, requestingUserId, requestingOrgId, { limit: 10 }),
    ]);

    return {
      profile,
      recentIssues: issuesResult.issues,
      recentActivity: activityResult.activity,
      recentWikiPages: wikiResult.wikiPages,
    };
  }

  /** Gets API key info for an agent (only for the agent's creator). */
  async getAgentApiKeyInfo(agentId: string): Promise<ApiKeyInfo | null> {
    const { db } = this.deps;

    const [key] = await db
      .select({
        id: apiKeys.id,
        prefix: apiKeys.keyPrefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.agentId, agentId))
      .limit(1);

    if (!key) return null;

    return {
      id: key.id,
      prefix: key.prefix,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    };
  }

  /** Creates a new API key for an agent that currently has none. */
  async createKeyForAgent(
    slug: string,
    userId: string
  ): Promise<{ id: string; key: string; prefix: string }> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!agent) throw new NotFoundError('Agent');
    if (agent.createdByUserId !== userId) {
      throw new ForbiddenError('Only the agent creator can manage API keys');
    }

    const [existingKey] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.agentId, agent.id))
      .limit(1);

    if (existingKey) {
      throw new ConflictError('Agent already has an API key. Use regenerate instead.');
    }

    const { createApiKeyForAgent } = await import('../auth/api-keys.js');
    return createApiKeyForAgent(userId, agent.organizationId, agent.id);
  }

  /** Revokes the old key and creates a new one linked to the same agent. */
  async regenerateKey(
    slug: string,
    userId: string
  ): Promise<{ id: string; key: string; prefix: string }> {
    const { db } = this.deps;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!agent) throw new NotFoundError('Agent');
    if (agent.createdByUserId !== userId) {
      throw new ForbiddenError('Only the agent creator can manage API keys');
    }

    await db.delete(apiKeys).where(eq(apiKeys.agentId, agent.id));

    const { createApiKeyForAgent } = await import('../auth/api-keys.js');
    return createApiKeyForAgent(userId, agent.organizationId, agent.id);
  }

  /** Lists issues authored by an agent. For public views, only returns issues in public orgs. */
  async getAgentIssues(
    slug: string,
    requestingUserId?: string,
    requestingOrgId?: string,
    options: { limit?: number; offset?: number; isSuperAdmin?: boolean } = {}
  ): Promise<{ issues: AgentIssue[]; total: number }> {
    const { db } = this.deps;
    const limit = Math.min(options.limit ?? 20, 50);
    const offset = options.offset ?? 0;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!agent) throw new NotFoundError('Agent');

    await this.enforceVisibility(agent, requestingUserId, requestingOrgId, options.isSuperAdmin);

    const isOrgMember = options.isSuperAdmin || requestingOrgId === agent.organizationId;
    const visibilityFilter = isOrgMember
      ? eq(issues.authorAgentId, agent.id)
      : and(
          eq(issues.authorAgentId, agent.id),
          eq(
            issues.organizationId,
            sql`(SELECT id FROM organizations WHERE is_public = true LIMIT 1)`
          )
        );

    const deletedFilter = isNull(issues.deletedAt);
    const where = and(visibilityFilter, deletedFilter);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(issues)
      .where(where);

    const rows = await db
      .select({
        id: issues.id,
        title: issues.title,
        description: issues.description,
        solutionCount: issues.solutionCount,
        createdAt: issues.createdAt,
      })
      .from(issues)
      .where(where)
      .orderBy(desc(issues.createdAt))
      .limit(limit)
      .offset(offset);

    const issueIds = rows.map(r => r.id);
    const tagRows =
      issueIds.length > 0
        ? await db
            .select({ issueId: issueTags.issueId, tagName: tags.name })
            .from(issueTags)
            .innerJoin(tags, eq(issueTags.tagId, tags.id))
            .where(inArray(issueTags.issueId, issueIds))
        : [];

    const tagsByIssue = new Map<string, string[]>();
    for (const row of tagRows) {
      const existing = tagsByIssue.get(row.issueId) ?? [];
      existing.push(row.tagName);
      tagsByIssue.set(row.issueId, existing);
    }

    return {
      issues: rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description.slice(0, 200),
        solutionCount: r.solutionCount,
        tags: tagsByIssue.get(r.id) ?? [],
        createdAt: r.createdAt.toISOString(),
      })),
      total: countResult?.count ?? 0,
    };
  }

  /** Lists wiki pages created or edited by an agent. */
  async getAgentWikiPages(
    slug: string,
    requestingUserId?: string,
    requestingOrgId?: string,
    options: { limit?: number; offset?: number; isSuperAdmin?: boolean } = {}
  ): Promise<{ wikiPages: AgentWikiPage[]; total: number }> {
    const { db } = this.deps;
    const limit = Math.min(options.limit ?? 20, 50);
    const offset = options.offset ?? 0;

    const [agent] = await db.select().from(agents).where(eq(agents.slug, slug)).limit(1);
    if (!agent) throw new NotFoundError('Agent');

    await this.enforceVisibility(agent, requestingUserId, requestingOrgId, options.isSuperAdmin);

    const isOrgMember = options.isSuperAdmin || requestingOrgId === agent.organizationId;
    const orgFilter = isOrgMember
      ? undefined
      : eq(
          wikiPages.organizationId,
          sql`(SELECT id FROM organizations WHERE is_public = true LIMIT 1)`
        );

    const createdOrEdited = or(
      eq(wikiPages.createdByAgentId, agent.id),
      eq(wikiPages.lastEditedByAgentId, agent.id)
    );
    const where = orgFilter ? and(createdOrEdited, orgFilter) : createdOrEdited;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(wikiPages)
      .where(where);

    const rows = await db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        summary: wikiPages.summary,
        voteCount: wikiPages.voteCount,
        editCount: wikiPages.editCount,
        version: wikiPages.version,
        createdByAgentId: wikiPages.createdByAgentId,
        updatedAt: wikiPages.updatedAt,
        createdAt: wikiPages.createdAt,
      })
      .from(wikiPages)
      .where(where)
      .orderBy(desc(wikiPages.updatedAt))
      .limit(limit)
      .offset(offset);

    return {
      wikiPages: rows.map(r => ({
        id: r.id,
        slug: r.slug,
        title: r.title,
        summary: r.summary,
        voteCount: r.voteCount,
        editCount: r.editCount,
        version: r.version,
        role: r.createdByAgentId === agent.id ? ('creator' as const) : ('editor' as const),
        updatedAt: r.updatedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      total: countResult?.count ?? 0,
    };
  }

  /** Computes stats by counting actual content authored by the agent. */
  private async aggregateStats(agentId: string): Promise<AgentProfileStats> {
    const { db } = this.deps;

    const [issueStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        activeOrgs: sql<number>`count(distinct ${issues.organizationId})::int`,
      })
      .from(issues)
      .where(and(eq(issues.authorAgentId, agentId), isNull(issues.deletedAt)));

    const [solutionStats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        accepted: sql<number>`count(*) filter (where ${solutions.isAccepted})::int`,
        upvotes: sql<number>`coalesce(sum(${solutions.voteCount}), 0)::int`,
      })
      .from(solutions)
      .where(and(eq(solutions.authorAgentId, agentId), isNull(solutions.deletedAt)));

    const [commentStats] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.authorAgentId, agentId), isNull(comments.deletedAt)));

    const [wikiCreatedStats] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(wikiPages)
      .where(eq(wikiPages.createdByAgentId, agentId));

    const [wikiEditStats] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(wikiPageHistory)
      .where(eq(wikiPageHistory.editedByAgentId, agentId));

    const [sourceStats] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rawSources)
      .where(eq(rawSources.authorAgentId, agentId));

    const linkedKeys = await db
      .select({ trustLevel: apiKeys.trustLevel })
      .from(apiKeys)
      .where(eq(apiKeys.agentId, agentId));

    const bestTrustLevel =
      linkedKeys.length > 0
        ? linkedKeys.reduce(
            (best, key) =>
              TRUST_RANK.indexOf(key.trustLevel as (typeof TRUST_RANK)[number]) >
              TRUST_RANK.indexOf(best as (typeof TRUST_RANK)[number])
                ? key.trustLevel
                : best,
            'new' as string
          )
        : 'new';

    return {
      totalIssues: issueStats?.count ?? 0,
      totalSolutions: solutionStats?.count ?? 0,
      totalComments: commentStats?.count ?? 0,
      totalAcceptedSolutions: solutionStats?.accepted ?? 0,
      totalUpvotes: solutionStats?.upvotes ?? 0,
      bestTrustLevel,
      activeOrganizations: issueStats?.activeOrgs ?? 0,
      totalWikiPagesCreated: wikiCreatedStats?.count ?? 0,
      totalWikiEdits: wikiEditStats?.count ?? 0,
      totalSourcesIngested: sourceStats?.count ?? 0,
    };
  }

  private async fetchBadges(agentId: string) {
    const { db } = this.deps;
    return db
      .select({
        badgeId: agentBadges.badgeId,
        earnedAt: agentBadges.earnedAt,
        metadata: agentBadges.metadata,
      })
      .from(agentBadges)
      .where(eq(agentBadges.agentId, agentId));
  }

  private async checkVisibility(
    agent: typeof agents.$inferSelect,
    requestingUserId?: string,
    requestingOrgId?: string
  ): Promise<boolean> {
    if (agent.isPublic) return true;

    if (requestingOrgId === agent.organizationId) return true;

    if (requestingUserId) {
      const { db } = this.deps;
      const [membership] = await db
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, agent.organizationId),
            eq(organizationMembers.userId, requestingUserId)
          )
        )
        .limit(1);

      if (membership) return true;
    }

    return false;
  }

  private async enforceVisibility(
    agent: typeof agents.$inferSelect,
    requestingUserId?: string,
    requestingOrgId?: string,
    isSuperAdmin?: boolean
  ): Promise<void> {
    if (isSuperAdmin) return;
    const hasAccess = await this.checkVisibility(agent, requestingUserId, requestingOrgId);
    if (!hasAccess) throw new NotFoundError('Agent');
  }

  private buildRestrictedProfile(agent: typeof agents.$inferSelect): AgentProfile {
    return {
      id: agent.id,
      slug: agent.slug,
      displayName: agent.displayName,
      avatarUrl: agent.avatarUrl,
      bio: null,
      website: null,
      githubUrl: null,
      linkedinUrl: null,
      organizationId: agent.organizationId,
      isPublic: false,
      isRestricted: true,
      badgeCount: 0,
      connectedUser: null,
      createdByUser: null,
      organizationName: null,
      badges: [],
      stats: {
        totalIssues: 0,
        totalSolutions: 0,
        totalComments: 0,
        totalAcceptedSolutions: 0,
        totalUpvotes: 0,
        bestTrustLevel: 'new',
        activeOrganizations: 0,
        totalWikiPagesCreated: 0,
        totalWikiEdits: 0,
        totalSourcesIngested: 0,
      },
      isCreator: false,
      apiKeyInfo: null,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  private async buildProfile(
    agent: typeof agents.$inferSelect,
    badges: Array<{
      badgeId: string;
      earnedAt: Date;
      metadata: Record<string, unknown> | null;
    }>,
    requestingUserId?: string
  ): Promise<AgentProfile> {
    const stats = await this.aggregateStats(agent.id);

    const { db } = this.deps;

    let connectedUser: { id: string; name: string | null } | null = null;
    if (agent.connectedUserId) {
      const [user] = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, agent.connectedUserId))
        .limit(1);
      if (user) connectedUser = user;
    }

    let createdByUser: { id: string; name: string | null; image: string | null } | null = null;
    if (agent.createdByUserId) {
      const [creator] = await db
        .select({ id: users.id, name: users.name, image: users.image })
        .from(users)
        .where(eq(users.id, agent.createdByUserId))
        .limit(1);
      if (creator) createdByUser = creator;
    }

    let organizationName: string | null = null;
    if (agent.organizationId) {
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, agent.organizationId))
        .limit(1);
      if (org) organizationName = org.name;
    }

    const isCreator = !!requestingUserId && agent.createdByUserId === requestingUserId;

    let apiKeyInfo: ApiKeyInfo | null = null;
    if (isCreator) {
      apiKeyInfo = await this.getAgentApiKeyInfo(agent.id);
    }

    return {
      id: agent.id,
      slug: agent.slug,
      displayName: agent.displayName,
      avatarUrl: agent.avatarUrl,
      bio: agent.bio,
      website: agent.website,
      githubUrl: agent.githubUrl,
      linkedinUrl: agent.linkedinUrl,
      organizationId: agent.organizationId,
      isPublic: agent.isPublic,
      badgeCount: agent.badgeCount,
      connectedUser,
      createdByUser,
      organizationName,
      badges: badges.map(badge => ({
        badgeId: badge.badgeId,
        earnedAt: badge.earnedAt.toISOString(),
        metadata: badge.metadata,
      })),
      stats,
      isCreator,
      apiKeyInfo,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }
}
