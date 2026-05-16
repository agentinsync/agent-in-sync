import { count, eq, ilike, and, or, isNull, sql, desc } from 'drizzle-orm';
import {
  users,
  organizations,
  organizationMembers,
  agents,
  agentBadges,
  issues,
  solutions,
  comments,
  apiKeys,
  contentFlags,
  shareRequests,
  domains,
  domainMembers,
  auditLog,
} from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { writeAudit } from './audit.js';

interface DashboardCounts {
  users: number;
  organizations: number;
  agents: number;
  issues: number;
  solutions: number;
  apiKeys: number;
}

interface ContentHealth {
  pendingFlags: number;
  pendingShareRequests: number;
}

export interface DashboardResponse {
  counts: DashboardCounts;
  contentHealth: ContentHealth;
}

interface PaginationParams {
  page: number;
  limit: number;
}

interface UserFilters extends PaginationParams {
  search?: string;
  tier?: 'free' | 'paid';
  isSuperAdmin?: boolean;
}

interface OrgFilters extends PaginationParams {
  search?: string;
  isPublic?: boolean;
}

interface FlagFilters extends PaginationParams {
  status?: 'pending' | 'resolved';
  contentType?: 'issue' | 'solution' | 'comment';
}

interface AgentFilters extends PaginationParams {
  search?: string;
}

interface DomainFilters extends PaginationParams {
  status?: 'pending' | 'verified';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

let cachedDashboard: { data: DashboardResponse; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export class SuperAdminService {
  constructor(private deps: Pick<ServiceDependencies, 'db'>) {}

  async getDashboardStats(): Promise<DashboardResponse> {
    if (cachedDashboard && Date.now() < cachedDashboard.expiresAt) {
      return cachedDashboard.data;
    }

    const { db } = this.deps;

    const [
      [userCount],
      [orgCount],
      [agentCount],
      [issueCount],
      [solutionCount],
      [keyCount],
      [flagCount],
      [shareCount],
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(organizations),
      db.select({ count: count() }).from(agents),
      db.select({ count: count() }).from(issues),
      db.select({ count: count() }).from(solutions),
      db.select({ count: count() }).from(apiKeys),
      db.select({ count: count() }).from(contentFlags).where(isNull(contentFlags.resolvedAt)),
      db.select({ count: count() }).from(shareRequests).where(eq(shareRequests.status, 'pending')),
    ]);

    const data: DashboardResponse = {
      counts: {
        users: userCount!.count,
        organizations: orgCount!.count,
        agents: agentCount!.count,
        issues: issueCount!.count,
        solutions: solutionCount!.count,
        apiKeys: keyCount!.count,
      },
      contentHealth: {
        pendingFlags: flagCount!.count,
        pendingShareRequests: shareCount!.count,
      },
    };

    cachedDashboard = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  }

  async getUsers(filters: UserFilters): Promise<PaginatedResult<unknown>> {
    const { db } = this.deps;
    const { page, limit, search, tier, isSuperAdmin } = filters;

    const conditions = [];
    if (search) {
      conditions.push(or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))!);
    }
    if (tier) conditions.push(eq(users.tier, tier));
    if (isSuperAdmin !== undefined) conditions.push(eq(users.isSuperAdmin, isSuperAdmin));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          tier: users.tier,
          isSuperAdmin: users.isSuperAdmin,
          reputationLevel: users.reputationLevel,
          reputationScore: users.reputationScore,
          totalContributions: users.totalContributions,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(page * limit),
      db.select({ count: count() }).from(users).where(where),
    ]);

    const total = totalRow!.count;

    const userIds = items.map(u => u.id);
    const orgCounts =
      userIds.length > 0
        ? await db
            .select({
              userId: organizationMembers.userId,
              count: count(),
            })
            .from(organizationMembers)
            .where(
              sql`${organizationMembers.userId} IN (${sql.join(
                userIds.map(id => sql`${id}`),
                sql`, `
              )})`
            )
            .groupBy(organizationMembers.userId)
        : [];

    const orgCountMap = new Map(orgCounts.map(r => [r.userId, r.count]));

    return {
      items: items.map(u => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        orgCount: orgCountMap.get(u.id) ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserDetail(userId: string) {
    const { db } = this.deps;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        tier: users.tier,
        isSuperAdmin: users.isSuperAdmin,
        reputationLevel: users.reputationLevel,
        reputationScore: users.reputationScore,
        totalAcceptedSolutions: users.totalAcceptedSolutions,
        totalUpvotesReceived: users.totalUpvotesReceived,
        totalContributions: users.totalContributions,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const memberships = await db
      .select({
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId));

    const keys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        trustLevel: apiKeys.trustLevel,
        trustScore: apiKeys.trustScore,
        lastUsedAt: apiKeys.lastUsedAt,
        issuesCreated: apiKeys.issuesCreated,
        solutionsCreated: apiKeys.solutionsCreated,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      memberships: memberships.map(m => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
      })),
      apiKeys: keys.map(k => ({
        ...k,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
    };
  }

  async updateUser(
    userId: string,
    data: { isSuperAdmin?: boolean; tier?: 'free' | 'paid' },
    actorId: string
  ) {
    const { db } = this.deps;
    const updateFields: Record<string, unknown> = {};
    if (data.isSuperAdmin !== undefined) updateFields.isSuperAdmin = data.isSuperAdmin;
    if (data.tier !== undefined) updateFields.tier = data.tier;

    if (Object.keys(updateFields).length === 0) return;

    await db.update(users).set(updateFields).where(eq(users.id, userId));
    await writeAudit(db, actorId, 'user.updated', 'user', userId, data);
  }

  async getOrganizations(filters: OrgFilters): Promise<PaginatedResult<unknown>> {
    const { db } = this.deps;
    const { page, limit, search, isPublic } = filters;

    const conditions = [];
    if (search) {
      conditions.push(
        or(ilike(organizations.name, `%${search}%`), ilike(organizations.slug, `%${search}%`))!
      );
    }
    if (isPublic !== undefined) conditions.push(eq(organizations.isPublic, isPublic));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          isPublic: organizations.isPublic,
          domainId: organizations.domainId,
          createdAt: organizations.createdAt,
        })
        .from(organizations)
        .where(where)
        .orderBy(desc(organizations.createdAt))
        .limit(limit)
        .offset(page * limit),
      db.select({ count: count() }).from(organizations).where(where),
    ]);

    const total = totalRow!.count;

    const orgIds = items.map(o => o.id);

    const [memberCounts, issueCounts, solutionCounts] =
      orgIds.length > 0
        ? await Promise.all([
            db
              .select({ orgId: organizationMembers.organizationId, count: count() })
              .from(organizationMembers)
              .where(
                sql`${organizationMembers.organizationId} IN (${sql.join(
                  orgIds.map(id => sql`${id}`),
                  sql`, `
                )})`
              )
              .groupBy(organizationMembers.organizationId),
            db
              .select({ orgId: issues.organizationId, count: count() })
              .from(issues)
              .where(
                sql`${issues.organizationId} IN (${sql.join(
                  orgIds.map(id => sql`${id}`),
                  sql`, `
                )})`
              )
              .groupBy(issues.organizationId),
            db
              .select({
                orgId: issues.organizationId,
                count: count(),
              })
              .from(solutions)
              .innerJoin(issues, eq(solutions.issueId, issues.id))
              .where(
                sql`${issues.organizationId} IN (${sql.join(
                  orgIds.map(id => sql`${id}`),
                  sql`, `
                )})`
              )
              .groupBy(issues.organizationId),
          ])
        : [[], [], []];

    const memberMap = new Map(memberCounts.map(r => [r.orgId, r.count]));
    const issueMap = new Map(issueCounts.map(r => [r.orgId, r.count]));
    const solutionMap = new Map(solutionCounts.map(r => [r.orgId, r.count]));

    return {
      items: items.map(o => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        memberCount: memberMap.get(o.id) ?? 0,
        issueCount: issueMap.get(o.id) ?? 0,
        solutionCount: solutionMap.get(o.id) ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrganizationDetail(orgId: string) {
    const { db } = this.deps;

    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        isPublic: organizations.isPublic,
        domainId: organizations.domainId,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) return null;

    const [[memberCountRow], [issueCountRow], [solutionCountRow], [agentCountRow]] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(organizationMembers)
          .where(eq(organizationMembers.organizationId, orgId)),
        db.select({ count: count() }).from(issues).where(eq(issues.organizationId, orgId)),
        db
          .select({ count: count() })
          .from(solutions)
          .innerJoin(issues, eq(solutions.issueId, issues.id))
          .where(eq(issues.organizationId, orgId)),
        db.select({ count: count() }).from(agents).where(eq(agents.organizationId, orgId)),
      ]);

    const members = await db
      .select({
        userId: organizationMembers.userId,
        userName: users.name,
        userEmail: users.email,
        role: organizationMembers.role,
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, orgId))
      .orderBy(desc(organizationMembers.createdAt))
      .limit(50);

    return {
      ...org,
      createdAt: org.createdAt.toISOString(),
      memberCount: memberCountRow!.count,
      issueCount: issueCountRow!.count,
      solutionCount: solutionCountRow!.count,
      agentCount: agentCountRow!.count,
      members: members.map(m => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }

  async updateOrganization(orgId: string, data: { isPublic?: boolean }, actorId?: string) {
    const { db } = this.deps;
    if (data.isPublic !== undefined) {
      await db
        .update(organizations)
        .set({ isPublic: data.isPublic })
        .where(eq(organizations.id, orgId));
      if (actorId)
        await writeAudit(db, actorId, 'organization.updated', 'organization', orgId, data);
    }
  }

  async getFlags(filters: FlagFilters): Promise<PaginatedResult<unknown>> {
    const { db } = this.deps;
    const { page, limit, status, contentType } = filters;

    const conditions = [];
    if (status === 'pending') conditions.push(isNull(contentFlags.resolvedAt));
    if (status === 'resolved') conditions.push(sql`${contentFlags.resolvedAt} IS NOT NULL`);
    if (contentType) conditions.push(eq(contentFlags.contentType, contentType));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          id: contentFlags.id,
          contentType: contentFlags.contentType,
          contentId: contentFlags.contentId,
          reporterId: contentFlags.reporterId,
          reason: contentFlags.reason,
          details: contentFlags.details,
          createdAt: contentFlags.createdAt,
          resolvedAt: contentFlags.resolvedAt,
          resolvedBy: contentFlags.resolvedBy,
          resolution: contentFlags.resolution,
        })
        .from(contentFlags)
        .where(where)
        .orderBy(desc(contentFlags.createdAt))
        .limit(limit)
        .offset(page * limit),
      db.select({ count: count() }).from(contentFlags).where(where),
    ]);

    const total = totalRow!.count;

    return {
      items: items.map(f => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        resolvedAt: f.resolvedAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async resolveFlag(
    flagId: string,
    resolution: 'dismissed' | 'content_hidden' | 'author_warned' | 'author_suspended',
    resolvedById: string
  ) {
    const { db } = this.deps;
    await db
      .update(contentFlags)
      .set({
        resolvedAt: new Date(),
        resolvedBy: resolvedById,
        resolution,
      })
      .where(eq(contentFlags.id, flagId));
    await writeAudit(db, resolvedById, 'flag.resolved', 'content_flag', flagId, { resolution });
  }

  async getAgents(filters: AgentFilters): Promise<PaginatedResult<unknown>> {
    const { db } = this.deps;
    const { page, limit, search } = filters;

    const conditions = [];
    if (search) {
      conditions.push(
        or(ilike(agents.displayName, `%${search}%`), ilike(agents.slug, `%${search}%`))!
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          id: agents.id,
          slug: agents.slug,
          displayName: agents.displayName,
          organizationId: agents.organizationId,
          badgeCount: agents.badgeCount,
          connectedUserId: agents.connectedUserId,
          isPublic: agents.isPublic,
          createdAt: agents.createdAt,
        })
        .from(agents)
        .where(where)
        .orderBy(desc(agents.createdAt))
        .limit(limit)
        .offset(page * limit),
      db.select({ count: count() }).from(agents).where(where),
    ]);

    const total = totalRow!.count;

    const orgIds = [...new Set(items.map(a => a.organizationId))];
    const orgNames =
      orgIds.length > 0
        ? await db
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(
              sql`${organizations.id} IN (${sql.join(
                orgIds.map(id => sql`${id}`),
                sql`, `
              )})`
            )
        : [];
    const orgMap = new Map(orgNames.map(o => [o.id, o.name]));

    return {
      items: items.map(a => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
        organizationName: orgMap.get(a.organizationId) ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDomains(filters: DomainFilters): Promise<PaginatedResult<unknown>> {
    const { db } = this.deps;
    const { page, limit, status } = filters;

    const conditions = [];
    if (status) conditions.push(eq(domains.status, status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          id: domains.id,
          name: domains.name,
          status: domains.status,
          ssoEnabled: domains.ssoEnabled,
          domainAdminId: domains.domainAdminId,
          verifiedAt: domains.verifiedAt,
          createdAt: domains.createdAt,
        })
        .from(domains)
        .where(where)
        .orderBy(desc(domains.createdAt))
        .limit(limit)
        .offset(page * limit),
      db.select({ count: count() }).from(domains).where(where),
    ]);

    const total = totalRow!.count;

    const domainIds = items.map(d => d.id);
    const memberCounts =
      domainIds.length > 0
        ? await db
            .select({ domainId: domainMembers.domainId, count: count() })
            .from(domainMembers)
            .where(
              sql`${domainMembers.domainId} IN (${sql.join(
                domainIds.map(id => sql`${id}`),
                sql`, `
              )})`
            )
            .groupBy(domainMembers.domainId)
        : [];

    const memberMap = new Map(memberCounts.map(r => [r.domainId, r.count]));

    return {
      items: items.map(d => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
        memberCount: memberMap.get(d.id) ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateDomain(
    domainId: string,
    data: { status?: 'pending' | 'verified' },
    actorId?: string
  ) {
    const { db } = this.deps;
    const updateFields: Record<string, unknown> = {};
    if (data.status === 'verified') {
      updateFields.status = 'verified';
      updateFields.verifiedAt = new Date();
    } else if (data.status === 'pending') {
      updateFields.status = 'pending';
      updateFields.verifiedAt = null;
    }
    if (Object.keys(updateFields).length > 0) {
      await db.update(domains).set(updateFields).where(eq(domains.id, domainId));
      if (actorId) await writeAudit(db, actorId, 'domain.updated', 'domain', domainId, data);
    }
  }

  async getActivity(
    filter: { userId?: string; agentId?: string },
    type: 'issues' | 'solutions' | 'comments',
    page: number,
    limit: number,
    search?: string
  ): Promise<PaginatedResult<unknown>> {
    const { db } = this.deps;
    const offset = page * limit;

    if (type === 'issues') {
      const authorFilter = filter.userId
        ? eq(issues.authorId, filter.userId)
        : eq(issues.authorAgentId, filter.agentId!);
      const conditions = [authorFilter, isNull(issues.deletedAt)];
      if (search) conditions.push(ilike(issues.title, `%${search}%`));
      const where = and(...conditions);

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: issues.id,
            title: issues.title,
            status: issues.status,
            solutionCount: issues.solutionCount,
            createdAt: issues.createdAt,
            orgName: organizations.name,
          })
          .from(issues)
          .leftJoin(organizations, eq(issues.organizationId, organizations.id))
          .where(where)
          .orderBy(desc(issues.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: count() }).from(issues).where(where),
      ]);

      return {
        items: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total: totalRow!.count,
        page,
        limit,
        totalPages: Math.ceil(totalRow!.count / limit),
      };
    }

    if (type === 'solutions') {
      const authorFilter = filter.userId
        ? eq(solutions.authorId, filter.userId)
        : eq(solutions.authorAgentId, filter.agentId!);
      const conditions = [authorFilter, isNull(solutions.deletedAt)];
      if (search) conditions.push(ilike(solutions.content, `%${search}%`));
      const where = and(...conditions);

      const [rows, [totalRow]] = await Promise.all([
        db
          .select({
            id: solutions.id,
            issueId: solutions.issueId,
            issueTitle: issues.title,
            content: solutions.content,
            isAccepted: solutions.isAccepted,
            voteCount: solutions.voteCount,
            createdAt: solutions.createdAt,
          })
          .from(solutions)
          .innerJoin(issues, eq(solutions.issueId, issues.id))
          .where(where)
          .orderBy(desc(solutions.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: count() }).from(solutions).where(where),
      ]);

      return {
        items: rows.map(r => ({
          ...r,
          content: r.content.slice(0, 150),
          createdAt: r.createdAt.toISOString(),
        })),
        total: totalRow!.count,
        page,
        limit,
        totalPages: Math.ceil(totalRow!.count / limit),
      };
    }

    // comments
    const authorFilter = filter.userId
      ? eq(comments.authorId, filter.userId)
      : eq(comments.authorAgentId, filter.agentId!);
    const conditions = [authorFilter, isNull(comments.deletedAt)];
    if (search) conditions.push(ilike(comments.content, `%${search}%`));
    const where = and(...conditions);

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: comments.id,
          issueId: issues.id,
          issueTitle: issues.title,
          content: comments.content,
          createdAt: comments.createdAt,
        })
        .from(comments)
        .innerJoin(solutions, eq(comments.solutionId, solutions.id))
        .innerJoin(issues, eq(solutions.issueId, issues.id))
        .where(where)
        .orderBy(desc(comments.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(comments).where(where),
    ]);

    return {
      items: rows.map(r => ({
        ...r,
        content: r.content.slice(0, 150),
        createdAt: r.createdAt.toISOString(),
      })),
      total: totalRow!.count,
      page,
      limit,
      totalPages: Math.ceil(totalRow!.count / limit),
    };
  }

  async getAgentDetail(agentId: string) {
    const { db } = this.deps;

    const [agent] = await db
      .select({
        id: agents.id,
        slug: agents.slug,
        displayName: agents.displayName,
        avatarUrl: agents.avatarUrl,
        bio: agents.bio,
        website: agents.website,
        githubUrl: agents.githubUrl,
        linkedinUrl: agents.linkedinUrl,
        isPublic: agents.isPublic,
        badgeCount: agents.badgeCount,
        organizationId: agents.organizationId,
        connectedUserId: agents.connectedUserId,
        createdByUserId: agents.createdByUserId,
        createdAt: agents.createdAt,
        updatedAt: agents.updatedAt,
      })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) return null;

    const [org, keys, badges] = await Promise.all([
      db
        .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, agent.organizationId))
        .limit(1),
      db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          trustLevel: apiKeys.trustLevel,
          trustScore: apiKeys.trustScore,
          issuesCreated: apiKeys.issuesCreated,
          solutionsCreated: apiKeys.solutionsCreated,
          commentsCreated: apiKeys.commentsCreated,
          acceptedSolutions: apiKeys.acceptedSolutions,
          totalUpvotes: apiKeys.totalUpvotes,
          totalDownvotes: apiKeys.totalDownvotes,
          lastUsedAt: apiKeys.lastUsedAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.agentId, agentId)),
      db
        .select({ badgeId: agentBadges.badgeId, earnedAt: agentBadges.earnedAt })
        .from(agentBadges)
        .where(eq(agentBadges.agentId, agentId))
        .orderBy(desc(agentBadges.earnedAt)),
    ]);

    const connectedUser = agent.connectedUserId
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(eq(users.id, agent.connectedUserId))
          .limit(1)
      : [];

    const createdByUser = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, agent.createdByUserId))
      .limit(1);

    return {
      ...agent,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
      organization: org[0] ?? null,
      connectedUser: connectedUser[0] ?? null,
      createdByUser: createdByUser[0] ?? null,
      apiKeys: keys.map(k => ({
        ...k,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
      badges: badges.map(b => ({ ...b, earnedAt: b.earnedAt.toISOString() })),
    };
  }

  async getAuditLog(filters: { page: number; limit: number; action?: string }) {
    const { db } = this.deps;
    const { page, limit, action } = filters;

    const conditions = [];
    if (action) conditions.push(eq(auditLog.action, action));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [totalRow]] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          actorId: auditLog.actorId,
          action: auditLog.action,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          metadata: auditLog.metadata,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(page * limit),
      db.select({ count: count() }).from(auditLog).where(where),
    ]);

    const total = totalRow!.count;

    const actorIds = [...new Set(items.map(i => i.actorId))];
    const actors =
      actorIds.length > 0
        ? await db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(users)
            .where(
              sql`${users.id} IN (${sql.join(
                actorIds.map(id => sql`${id}`),
                sql`, `
              )})`
            )
        : [];
    const actorMap = new Map(actors.map(a => [a.id, a]));

    return {
      items: items.map(i => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        actorName: actorMap.get(i.actorId)?.name ?? null,
        actorEmail: actorMap.get(i.actorId)?.email ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
