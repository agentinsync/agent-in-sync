import { eq, sql, and, desc, isNull, gte } from 'drizzle-orm';
import {
  issues,
  solutions,
  apiKeys,
  users,
  organizationMembers,
  contentFlags,
} from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';

export type ApiKeyStats = {
  id: string;
  name: string;
  keyPrefix: string;
  trustScore: number;
  trustLevel: string;
  issuesCreated: number;
  solutionsCreated: number;
  commentsCreated: number;
  acceptedSolutions: number;
  totalUpvotes: number;
  totalDownvotes: number;
  rejectedSubmissions: number;
  flaggedContent: number;
  createdAt: Date;
  lastUsedAt: Date | null;
  dailyIssuesCreated: number;
  dailySolutionsCreated: number;
  dailyCommentsCreated: number;
};

export type UserReputation = {
  userId: string;
  name: string;
  email: string;
  reputationScore: number;
  reputationLevel: string;
  totalAcceptedSolutions: number;
  totalUpvotesReceived: number;
  totalContributions: number;
  apiKeyCount: number;
  apiKeyBreakdown: Array<{
    id: string;
    name: string;
    trustLevel: string;
    acceptedSolutions: number;
  }>;
};

export type OrgStats = {
  totalIssues: number;
  totalSolutions: number;
  acceptedSolutions: number;
  acceptanceRate: number;
  avgTrustScore: number;
  pendingModeration: number;
  flaggedContent: number;
  topContributors: Array<{
    apiKeyId: string;
    name: string;
    acceptedSolutions: number;
    trustLevel: string;
  }>;
  activityLast30Days: {
    issues: number;
    solutions: number;
  };
};

export class StatsService {
  constructor(private deps: ServiceDependencies) {}

  async getApiKeyStats(apiKeyId: string, userId: string): Promise<ApiKeyStats | null> {
    const { db } = this.deps;

    const [apiKey] = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        trustScore: apiKeys.trustScore,
        trustLevel: apiKeys.trustLevel,
        issuesCreated: apiKeys.issuesCreated,
        solutionsCreated: apiKeys.solutionsCreated,
        commentsCreated: apiKeys.commentsCreated,
        acceptedSolutions: apiKeys.acceptedSolutions,
        totalUpvotes: apiKeys.totalUpvotes,
        totalDownvotes: apiKeys.totalDownvotes,
        rejectedSubmissions: apiKeys.rejectedSubmissions,
        flaggedContent: apiKeys.flaggedContent,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        dailyIssuesCreated: apiKeys.dailyIssuesCreated,
        dailySolutionsCreated: apiKeys.dailySolutionsCreated,
        dailyCommentsCreated: apiKeys.dailyCommentsCreated,
        ownerId: apiKeys.userId,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!apiKey) return null;

    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      trustScore: apiKey.trustScore,
      trustLevel: apiKey.trustLevel,
      issuesCreated: apiKey.issuesCreated,
      solutionsCreated: apiKey.solutionsCreated,
      commentsCreated: apiKey.commentsCreated,
      acceptedSolutions: apiKey.acceptedSolutions,
      totalUpvotes: apiKey.totalUpvotes,
      totalDownvotes: apiKey.totalDownvotes,
      rejectedSubmissions: apiKey.rejectedSubmissions,
      flaggedContent: apiKey.flaggedContent,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      dailyIssuesCreated: apiKey.dailyIssuesCreated,
      dailySolutionsCreated: apiKey.dailySolutionsCreated,
      dailyCommentsCreated: apiKey.dailyCommentsCreated,
    };
  }

  async getUserReputation(userId: string): Promise<UserReputation | null> {
    const { db } = this.deps;

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        reputationScore: users.reputationScore,
        reputationLevel: users.reputationLevel,
        totalAcceptedSolutions: users.totalAcceptedSolutions,
        totalUpvotesReceived: users.totalUpvotesReceived,
        totalContributions: users.totalContributions,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return null;

    const userApiKeys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        trustLevel: apiKeys.trustLevel,
        acceptedSolutions: apiKeys.acceptedSolutions,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.acceptedSolutions));

    return {
      userId: user.id,
      name: user.name ?? 'Unknown',
      email: user.email,
      reputationScore: user.reputationScore,
      reputationLevel: user.reputationLevel,
      totalAcceptedSolutions: user.totalAcceptedSolutions,
      totalUpvotesReceived: user.totalUpvotesReceived,
      totalContributions: user.totalContributions,
      apiKeyCount: userApiKeys.length,
      apiKeyBreakdown: userApiKeys.map(k => ({
        id: k.id,
        name: k.name,
        trustLevel: k.trustLevel,
        acceptedSolutions: k.acceptedSolutions,
      })),
    };
  }

  async getOrganizationStats(organizationId: string): Promise<OrgStats> {
    const { db } = this.deps;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [issueCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(and(eq(issues.organizationId, organizationId), isNull(issues.deletedAt)));

    const [solutionCounts] = await db
      .select({
        total: sql<number>`count(*)`,
        accepted: sql<number>`count(*) filter (where ${solutions.isAccepted} = true)`,
      })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .where(and(eq(issues.organizationId, organizationId), isNull(solutions.deletedAt)));

    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(and(eq(issues.organizationId, organizationId), eq(issues.status, 'pending')));

    const [flaggedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentFlags)
      .innerJoin(issues, eq(contentFlags.contentId, issues.id))
      .where(and(eq(issues.organizationId, organizationId), isNull(contentFlags.resolvedAt)));

    const memberApiKeys = await db
      .select({
        apiKeyId: apiKeys.id,
        name: apiKeys.name,
        trustScore: apiKeys.trustScore,
        trustLevel: apiKeys.trustLevel,
        acceptedSolutions: apiKeys.acceptedSolutions,
      })
      .from(apiKeys)
      .innerJoin(organizationMembers, eq(apiKeys.userId, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId));

    const avgTrustScore =
      memberApiKeys.length > 0
        ? memberApiKeys.reduce((sum, k) => sum + k.trustScore, 0) / memberApiKeys.length
        : 0;

    const topContributors = memberApiKeys
      .sort((a, b) => b.acceptedSolutions - a.acceptedSolutions)
      .slice(0, 5)
      .map(k => ({
        apiKeyId: k.apiKeyId,
        name: k.name,
        acceptedSolutions: k.acceptedSolutions,
        trustLevel: k.trustLevel,
      }));

    const [recentIssues] = await db
      .select({ count: sql<number>`count(*)` })
      .from(issues)
      .where(
        and(
          eq(issues.organizationId, organizationId),
          gte(issues.createdAt, thirtyDaysAgo),
          isNull(issues.deletedAt)
        )
      );

    const [recentSolutions] = await db
      .select({ count: sql<number>`count(*)` })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .where(
        and(
          eq(issues.organizationId, organizationId),
          gte(solutions.createdAt, thirtyDaysAgo),
          isNull(solutions.deletedAt)
        )
      );

    const totalSolutions = Number(solutionCounts?.total ?? 0);
    const acceptedSolutions = Number(solutionCounts?.accepted ?? 0);

    return {
      totalIssues: Number(issueCount?.count ?? 0),
      totalSolutions,
      acceptedSolutions,
      acceptanceRate: totalSolutions > 0 ? acceptedSolutions / totalSolutions : 0,
      avgTrustScore: Math.round(avgTrustScore * 10) / 10,
      pendingModeration: Number(pendingCount?.count ?? 0),
      flaggedContent: Number(flaggedCount?.count ?? 0),
      topContributors,
      activityLast30Days: {
        issues: Number(recentIssues?.count ?? 0),
        solutions: Number(recentSolutions?.count ?? 0),
      },
    };
  }

  async getLeaderboard(
    organizationId: string | null,
    limit = 10
  ): Promise<
    Array<{
      userId: string;
      name: string;
      reputationScore: number;
      reputationLevel: string;
      acceptedSolutions: number;
    }>
  > {
    const { db } = this.deps;

    const baseQuery = db
      .select({
        userId: users.id,
        name: users.name,
        reputationScore: users.reputationScore,
        reputationLevel: users.reputationLevel,
        acceptedSolutions: users.totalAcceptedSolutions,
      })
      .from(users)
      .$dynamic();

    const query = organizationId
      ? baseQuery
          .innerJoin(organizationMembers, eq(users.id, organizationMembers.userId))
          .where(eq(organizationMembers.organizationId, organizationId))
      : baseQuery;

    const results = await query.orderBy(desc(users.reputationScore)).limit(limit);

    return results.map(r => ({
      userId: r.userId,
      name: r.name ?? 'Unknown',
      reputationScore: r.reputationScore,
      reputationLevel: r.reputationLevel,
      acceptedSolutions: r.acceptedSolutions,
    }));
  }
}
