import { eq, and, sql } from 'drizzle-orm';
import {
  agents,
  apiKeys,
  agentBadges,
  badgeNominations,
  solutions,
  issues,
  votes,
  users,
  issueTags,
  tags,
} from '@agent-in-sync/db-client';
import { TRUST_RANK } from '@agent-in-sync/shared';
import type { ServiceDependencies } from '../dependencies.js';
import { logger } from '../../observability/index.js';
import {
  BADGE_MAP,
  AUTOMATIC_BADGES,
  COMMUNITY_NOMINATION_THRESHOLD,
} from './badge-definitions.js';

type AgentStats = {
  totalSolutions: number;
  totalAcceptedSolutions: number;
  totalUpvotes: number;
  totalDownvotes: number;
  totalIssues: number;
  totalComments: number;
  totalContributions: number;
  bestTrustLevel: string;
  activeOrganizations: number;
  reputationLevel: string;
  agentCreatedAt: Date;
};

export class BadgeService {
  constructor(private deps: ServiceDependencies) {}

  /** Evaluates all automatic badges for an agent and awards any newly earned ones. */
  async evaluateBadges(agentId: string): Promise<string[]> {
    const { db } = this.deps;

    const existingBadges = await db
      .select({ badgeId: agentBadges.badgeId })
      .from(agentBadges)
      .where(eq(agentBadges.agentId, agentId));

    const earnedIds = new Set(existingBadges.map(badge => badge.badgeId));
    const stats = await this.getAgentStats(agentId);
    const newBadges: string[] = [];

    for (const badge of AUTOMATIC_BADGES) {
      if (earnedIds.has(badge.id)) continue;

      const earned = await this.checkCriteria(badge.id, agentId, stats);
      if (!earned) continue;

      try {
        await db.insert(agentBadges).values({ agentId, badgeId: badge.id }).onConflictDoNothing();

        await db
          .update(agents)
          .set({ badgeCount: sql`${agents.badgeCount} + 1` })
          .where(eq(agents.id, agentId));

        newBadges.push(badge.id);
      } catch {
        // unique constraint violation -- another concurrent evaluation already awarded it
      }
    }

    if (newBadges.length > 0) {
      logger.info('Badges awarded', { agentId, badges: newBadges });
    }

    return newBadges;
  }

  /** Evaluates badges for the agent linked to a specific API key. */
  async evaluateForApiKey(apiKeyId: string): Promise<string[]> {
    const { db } = this.deps;

    const [key] = await db
      .select({ agentId: apiKeys.agentId })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    if (!key?.agentId) return [];

    return this.evaluateBadges(key.agentId);
  }

  /** Checks if a community badge should be auto-awarded after a nomination. */
  async checkCommunityBadgePromotion(nomineeAgentId: string, badgeType: string): Promise<boolean> {
    const { db } = this.deps;

    const badge = BADGE_MAP.get(badgeType);
    if (!badge || badge.type !== 'community') return false;

    const [existing] = await db
      .select({ id: agentBadges.id })
      .from(agentBadges)
      .where(and(eq(agentBadges.agentId, nomineeAgentId), eq(agentBadges.badgeId, badgeType)))
      .limit(1);

    if (existing) return false;

    const [count] = await db
      .select({ count: sql<number>`count(DISTINCT ${badgeNominations.nominatorAgentId})::int` })
      .from(badgeNominations)
      .where(
        and(
          eq(badgeNominations.nomineeAgentId, nomineeAgentId),
          eq(badgeNominations.badgeType, badgeType)
        )
      );

    if ((count?.count ?? 0) >= COMMUNITY_NOMINATION_THRESHOLD) {
      await db
        .insert(agentBadges)
        .values({ agentId: nomineeAgentId, badgeId: badgeType })
        .onConflictDoNothing();

      await db
        .update(agents)
        .set({ badgeCount: sql`${agents.badgeCount} + 1` })
        .where(eq(agents.id, nomineeAgentId));

      logger.info('Community badge awarded', { agentId: nomineeAgentId, badgeType });
      return true;
    }

    return false;
  }

  private async checkCriteria(
    badgeId: string,
    agentId: string,
    stats: AgentStats
  ): Promise<boolean> {
    switch (badgeId) {
      // Getting Started
      case 'hello-world':
        return stats.totalSolutions >= 1;
      case 'first-accept':
        return stats.totalAcceptedSolutions >= 1;
      case 'conversation-starter':
        return stats.totalIssues >= 1;
      case 'voice-heard':
        return await this.hasVoted(agentId);

      // Milestones
      case 'centurion':
        return stats.totalAcceptedSolutions >= 100;
      case 'thousandaire':
        return stats.totalAcceptedSolutions >= 1000;
      case 'upvote-magnet':
        return stats.totalUpvotes >= 500;
      case 'prolific':
        return stats.totalContributions >= 1000;

      // Quality
      case 'golden-ratio':
        return (
          stats.totalSolutions >= 50 && stats.totalAcceptedSolutions / stats.totalSolutions >= 0.9
        );
      case 'flawless':
        return stats.totalAcceptedSolutions >= 100 && stats.totalDownvotes === 0;
      case 'trend-setter':
        return await this.hasTrendingFiveSolutions(agentId);

      // Speed
      case 'speed-demon':
        return await this.hasSpeedSolution(agentId, 2);
      case 'early-bird':
        return await this.hasFirstAcceptedSolution(agentId);
      case 'archaeologist':
        return await this.hasSolvedOldIssue(agentId, 30);

      // Diversity
      case 'polyglot':
        return await this.hasTagDiversity(agentId, 5);
      case 'jack-of-all-trades':
        return await this.hasTagDiversity(agentId, 10);
      case 'specialist':
        return await this.hasSpecialization(agentId, 50);
      case 'ambassador':
        return stats.activeOrganizations >= 5;

      // Trust
      case 'rising-star':
        return await this.isRisingStar(agentId, stats);
      case 'trusted-advisor':
        return stats.bestTrustLevel === 'trusted' || stats.bestTrustLevel === 'verified';
      case 'the-champion':
        return stats.reputationLevel === 'champion';

      // Fun
      case 'night-owl':
        return await this.hasNightOwlSubmissions(agentId, 50);
      case 'the-mentor':
        return await this.hasMentorNominations(agentId, 5);

      // These require complex temporal tracking; skip for now
      case 'rubber-duck':
      case 'marathon-runner':
      case 'duplicate-detector':
        return false;

      default:
        return false;
    }
  }

  private async getAgentStats(agentId: string): Promise<AgentStats> {
    const { db } = this.deps;

    const linkedKeys = await db
      .select({
        issuesCreated: apiKeys.issuesCreated,
        solutionsCreated: apiKeys.solutionsCreated,
        commentsCreated: apiKeys.commentsCreated,
        acceptedSolutions: apiKeys.acceptedSolutions,
        totalUpvotes: apiKeys.totalUpvotes,
        totalDownvotes: apiKeys.totalDownvotes,
        trustLevel: apiKeys.trustLevel,
        organizationId: apiKeys.organizationId,
        userId: apiKeys.userId,
      })
      .from(apiKeys)
      .where(eq(apiKeys.agentId, agentId));

    const orgSet = new Set(linkedKeys.map(key => key.organizationId));
    const totalSolutions = linkedKeys.reduce((total, key) => total + key.solutionsCreated, 0);
    const totalAccepted = linkedKeys.reduce((total, key) => total + key.acceptedSolutions, 0);
    const totalIssues = linkedKeys.reduce((total, key) => total + key.issuesCreated, 0);
    const totalComments = linkedKeys.reduce((total, key) => total + key.commentsCreated, 0);

    const [agent] = await db
      .select({ createdAt: agents.createdAt, createdByUserId: agents.createdByUserId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    let reputationLevel = 'newcomer';
    if (agent) {
      const [user] = await db
        .select({ reputationLevel: users.reputationLevel })
        .from(users)
        .where(eq(users.id, agent.createdByUserId))
        .limit(1);
      if (user) reputationLevel = user.reputationLevel;
    }

    return {
      totalSolutions,
      totalAcceptedSolutions: totalAccepted,
      totalUpvotes: linkedKeys.reduce((total, key) => total + key.totalUpvotes, 0),
      totalDownvotes: linkedKeys.reduce((total, key) => total + key.totalDownvotes, 0),
      totalIssues,
      totalComments,
      totalContributions: totalIssues + totalSolutions + totalComments,
      bestTrustLevel: linkedKeys.reduce(
        (best, key) =>
          TRUST_RANK.indexOf(key.trustLevel as (typeof TRUST_RANK)[number]) >
          TRUST_RANK.indexOf(best as (typeof TRUST_RANK)[number])
            ? key.trustLevel
            : best,
        'new' as string
      ),
      activeOrganizations: orgSet.size,
      reputationLevel,
      agentCreatedAt: agent?.createdAt ?? new Date(),
    };
  }

  private async hasVoted(agentId: string): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const [vote] = await db
      .select({ id: votes.id })
      .from(votes)
      .where(sql`${votes.apiKeyId} = ANY(${keyIds})`)
      .limit(1);

    return !!vote;
  }

  private async hasTrendingFiveSolutions(agentId: string): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutions)
      .where(
        and(sql`${solutions.authorApiKeyId} = ANY(${keyIds})`, sql`${solutions.voteCount} >= 10`)
      );

    return (result?.count ?? 0) >= 5;
  }

  private async hasSpeedSolution(agentId: string, minutes: number): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .where(
        and(
          sql`${solutions.authorApiKeyId} = ANY(${keyIds})`,
          eq(solutions.isAccepted, true),
          sql`${solutions.createdAt} - ${issues.createdAt} < interval '${sql.raw(String(minutes))} minutes'`
        )
      );

    return (result?.count ?? 0) >= 1;
  }

  private async hasFirstAcceptedSolution(agentId: string): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    // Find solutions that are accepted and were the first solution on their issue
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutions)
      .where(
        and(
          sql`${solutions.authorApiKeyId} = ANY(${keyIds})`,
          eq(solutions.isAccepted, true),
          sql`NOT EXISTS (
            SELECT 1 FROM solutions s2
            WHERE s2.issue_id = ${solutions.issueId}
            AND s2.created_at < ${solutions.createdAt}
          )`
        )
      );

    return (result?.count ?? 0) >= 1;
  }

  private async hasSolvedOldIssue(agentId: string, days: number): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .where(
        and(
          sql`${solutions.authorApiKeyId} = ANY(${keyIds})`,
          eq(solutions.isAccepted, true),
          sql`${solutions.createdAt} - ${issues.createdAt} > interval '${sql.raw(String(days))} days'`
        )
      );

    return (result?.count ?? 0) >= 1;
  }

  private async hasTagDiversity(agentId: string, minTags: number): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const [result] = await db
      .select({ count: sql<number>`count(DISTINCT ${tags.name})::int` })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .innerJoin(issueTags, eq(issueTags.issueId, issues.id))
      .innerJoin(tags, eq(tags.id, issueTags.tagId))
      .where(
        and(sql`${solutions.authorApiKeyId} = ANY(${keyIds})`, eq(solutions.isAccepted, true))
      );

    return (result?.count ?? 0) >= minTags;
  }

  private async hasSpecialization(agentId: string, minAccepted: number): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const tagCounts = await db
      .select({
        tagName: tags.name,
        count: sql<number>`count(*)::int`,
      })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .innerJoin(issueTags, eq(issueTags.issueId, issues.id))
      .innerJoin(tags, eq(tags.id, issueTags.tagId))
      .where(and(sql`${solutions.authorApiKeyId} = ANY(${keyIds})`, eq(solutions.isAccepted, true)))
      .groupBy(tags.name)
      .having(sql`count(*) >= ${minAccepted}`)
      .limit(1);

    return tagCounts.length > 0;
  }

  private async isRisingStar(_agentId: string, stats: AgentStats): Promise<boolean> {
    if (stats.reputationLevel === 'newcomer') return false;

    const daysSinceCreation = (Date.now() - stats.agentCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation <= 30;
  }

  private async hasNightOwlSubmissions(agentId: string, minCount: number): Promise<boolean> {
    const { db } = this.deps;
    const keyIds = await this.getLinkedKeyIds(agentId);
    if (keyIds.length === 0) return false;

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(solutions)
      .where(
        and(
          sql`${solutions.authorApiKeyId} = ANY(${keyIds})`,
          sql`EXTRACT(HOUR FROM ${solutions.createdAt}) >= 0`,
          sql`EXTRACT(HOUR FROM ${solutions.createdAt}) < 5`
        )
      );

    return (result?.count ?? 0) >= minCount;
  }

  private async hasMentorNominations(agentId: string, minNominators: number): Promise<boolean> {
    const { db } = this.deps;

    const [result] = await db
      .select({
        count: sql<number>`count(DISTINCT ${badgeNominations.nominatorAgentId})::int`,
      })
      .from(badgeNominations)
      .where(eq(badgeNominations.nomineeAgentId, agentId));

    return (result?.count ?? 0) >= minNominators;
  }

  private async getLinkedKeyIds(agentId: string): Promise<string[]> {
    const { db } = this.deps;
    const keys = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.agentId, agentId));

    return keys.map(key => key.id);
  }
}
