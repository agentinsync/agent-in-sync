import { eq, sql } from 'drizzle-orm';
import { apiKeys, users, notifications } from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import type { TrustLevel } from '@agent-in-sync/shared';

const TRUST_SCORE_WEIGHTS = {
  acceptedSolution: 10,
  upvote: 2,
  downvote: -1,
  rejectedSubmission: -20,
  flaggedContent: -30,
} as const;

const TRUST_LEVEL_THRESHOLDS = {
  established: { minScore: 10, minAge: 7, minAccepted: 1 },
  trusted: { minScore: 50, noFlagsDays: 30 },
} as const;

type TrustStat =
  | 'issuesCreated'
  | 'solutionsCreated'
  | 'commentsCreated'
  | 'acceptedSolutions'
  | 'totalUpvotes'
  | 'totalDownvotes'
  | 'rejectedSubmissions'
  | 'flaggedContent';

type DailyQuotaStat = 'dailyIssuesCreated' | 'dailySolutionsCreated' | 'dailyCommentsCreated';

export class TrustService {
  constructor(private deps: ServiceDependencies) {}

  async calculateTrustScore(apiKeyId: string): Promise<number> {
    const { db } = this.deps;

    const [apiKey] = await db
      .select({
        acceptedSolutions: apiKeys.acceptedSolutions,
        totalUpvotes: apiKeys.totalUpvotes,
        totalDownvotes: apiKeys.totalDownvotes,
        rejectedSubmissions: apiKeys.rejectedSubmissions,
        flaggedContent: apiKeys.flaggedContent,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    if (!apiKey) {
      return 0;
    }

    const score =
      apiKey.acceptedSolutions * TRUST_SCORE_WEIGHTS.acceptedSolution +
      apiKey.totalUpvotes * TRUST_SCORE_WEIGHTS.upvote +
      apiKey.totalDownvotes * Math.abs(TRUST_SCORE_WEIGHTS.downvote) +
      apiKey.rejectedSubmissions * Math.abs(TRUST_SCORE_WEIGHTS.rejectedSubmission) +
      apiKey.flaggedContent * Math.abs(TRUST_SCORE_WEIGHTS.flaggedContent);

    return score;
  }

  async getTrustLevel(apiKeyId: string): Promise<TrustLevel> {
    const { db } = this.deps;

    const [apiKey] = await db
      .select({ trustLevel: apiKeys.trustLevel })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    return (apiKey?.trustLevel as TrustLevel) ?? 'new';
  }

  async checkTrustLevelTransition(apiKeyId: string): Promise<TrustLevel | null> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [apiKey] = await db
        .select({
          id: apiKeys.id,
          userId: apiKeys.userId,
          trustLevel: apiKeys.trustLevel,
          trustScore: apiKeys.trustScore,
          acceptedSolutions: apiKeys.acceptedSolutions,
          flaggedContent: apiKeys.flaggedContent,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);

      if (!apiKey) {
        return null;
      }

      const currentLevel = apiKey.trustLevel as TrustLevel;
      if (currentLevel === 'verified' || currentLevel === 'suspended') {
        return null;
      }

      const score = await this.calculateTrustScore(apiKeyId);
      const ageInDays = Math.floor(
        (Date.now() - new Date(apiKey.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      let newLevel: TrustLevel | null = null;

      if (currentLevel === 'new') {
        if (
          ageInDays >= TRUST_LEVEL_THRESHOLDS.established.minAge &&
          score >= TRUST_LEVEL_THRESHOLDS.established.minScore &&
          apiKey.acceptedSolutions >= TRUST_LEVEL_THRESHOLDS.established.minAccepted
        ) {
          newLevel = 'established';
        }
      } else if (currentLevel === 'established') {
        if (score < TRUST_LEVEL_THRESHOLDS.established.minScore) {
          newLevel = 'new';
        } else if (
          score >= TRUST_LEVEL_THRESHOLDS.trusted.minScore &&
          apiKey.flaggedContent === 0
        ) {
          newLevel = 'trusted';
        }
      } else if (currentLevel === 'trusted') {
        if (score < TRUST_LEVEL_THRESHOLDS.trusted.minScore || apiKey.flaggedContent > 0) {
          newLevel = 'established';
        }
      }

      if (newLevel && newLevel !== currentLevel) {
        await db
          .update(apiKeys)
          .set({
            trustLevel: newLevel,
            trustScore: score,
            trustUpdatedAt: new Date(),
          })
          .where(eq(apiKeys.id, apiKeyId));

        await this.createTrustNotification(apiKey.userId, apiKeyId, currentLevel, newLevel);

        logger.info('Trust level transitioned', {
          apiKeyId,
          from: currentLevel,
          to: newLevel,
          score,
        });
        trackSuccess(OPERATIONS.TRUST_UPDATE, Date.now() - startTime);

        return newLevel;
      }

      if (score !== apiKey.trustScore) {
        await db
          .update(apiKeys)
          .set({ trustScore: score, trustUpdatedAt: new Date() })
          .where(eq(apiKeys.id, apiKeyId));
      }

      return null;
    } catch (err) {
      logger.logError('Failed to check trust level transition', err, { apiKeyId });
      trackError(OPERATIONS.TRUST_UPDATE, 'TRANSITION_CHECK_FAILED');
      throw err;
    }
  }

  async incrementStat(apiKeyId: string, stat: TrustStat, delta: number = 1): Promise<void> {
    const { db } = this.deps;

    const statColumnName = {
      issuesCreated: 'issues_created',
      solutionsCreated: 'solutions_created',
      commentsCreated: 'comments_created',
      acceptedSolutions: 'accepted_solutions',
      totalUpvotes: 'total_upvotes',
      totalDownvotes: 'total_downvotes',
      rejectedSubmissions: 'rejected_submissions',
      flaggedContent: 'flagged_content',
    } as const;

    const columnName = statColumnName[stat];

    await db
      .update(apiKeys)
      .set({ [stat]: sql`${sql.identifier(columnName)} + ${delta}` })
      .where(eq(apiKeys.id, apiKeyId));
  }

  async incrementDailyQuota(apiKeyId: string, stat: DailyQuotaStat): Promise<void> {
    const { db } = this.deps;

    const statColumnName = {
      dailyIssuesCreated: 'daily_issues_created',
      dailySolutionsCreated: 'daily_solutions_created',
      dailyCommentsCreated: 'daily_comments_created',
    } as const;

    const columnName = statColumnName[stat];

    await db
      .update(apiKeys)
      .set({ [stat]: sql`${sql.identifier(columnName)} + 1` })
      .where(eq(apiKeys.id, apiKeyId));
  }

  async resetDailyQuotaIfNeeded(apiKeyId: string): Promise<void> {
    const { db } = this.deps;

    const [apiKey] = await db
      .select({ quotaResetAt: apiKeys.quotaResetAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    if (!apiKey?.quotaResetAt) {
      return;
    }

    const now = new Date();
    const resetAt = new Date(apiKey.quotaResetAt);
    const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceReset >= 24) {
      await db
        .update(apiKeys)
        .set({
          dailyIssuesCreated: 0,
          dailySolutionsCreated: 0,
          dailyCommentsCreated: 0,
          quotaResetAt: now,
        })
        .where(eq(apiKeys.id, apiKeyId));
    }
  }

  async setTrustLevel(apiKeyId: string, level: TrustLevel, adminUserId: string): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [apiKey] = await db
        .select({ userId: apiKeys.userId, trustLevel: apiKeys.trustLevel })
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);

      if (!apiKey) {
        throw new Error('API_KEY_NOT_FOUND');
      }

      const oldLevel = apiKey.trustLevel as TrustLevel;

      await db
        .update(apiKeys)
        .set({ trustLevel: level, trustUpdatedAt: new Date() })
        .where(eq(apiKeys.id, apiKeyId));

      await this.createTrustNotification(apiKey.userId, apiKeyId, oldLevel, level);

      logger.info('Trust level manually set', {
        apiKeyId,
        from: oldLevel,
        to: level,
        adminUserId,
      });
      trackSuccess(OPERATIONS.TRUST_UPDATE, Date.now() - startTime);
    } catch (err) {
      logger.logError('Failed to set trust level', err, { apiKeyId, level, adminUserId });
      trackError(OPERATIONS.TRUST_UPDATE, 'SET_LEVEL_FAILED');
      throw err;
    }
  }

  async updateUserReputationFromApiKeys(userId: string): Promise<void> {
    const { db } = this.deps;

    const userApiKeys = await db
      .select({
        acceptedSolutions: apiKeys.acceptedSolutions,
        totalUpvotes: apiKeys.totalUpvotes,
        issuesCreated: apiKeys.issuesCreated,
        solutionsCreated: apiKeys.solutionsCreated,
        commentsCreated: apiKeys.commentsCreated,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    const totals = userApiKeys.reduce(
      (acc, key) => ({
        acceptedSolutions: acc.acceptedSolutions + key.acceptedSolutions,
        upvotes: acc.upvotes + key.totalUpvotes,
        contributions:
          acc.contributions + key.issuesCreated + key.solutionsCreated + key.commentsCreated,
      }),
      { acceptedSolutions: 0, upvotes: 0, contributions: 0 }
    );

    const reputationScore = totals.acceptedSolutions * 10 + totals.upvotes * 2;

    let reputationLevel: 'newcomer' | 'contributor' | 'expert' | 'champion' = 'newcomer';
    if (reputationScore >= 500 && totals.acceptedSolutions >= 100) {
      reputationLevel = 'champion';
    } else if (reputationScore >= 200 && totals.acceptedSolutions >= 25) {
      reputationLevel = 'expert';
    } else if (reputationScore >= 50 && totals.acceptedSolutions >= 5) {
      reputationLevel = 'contributor';
    }

    await db
      .update(users)
      .set({
        reputationScore,
        reputationLevel,
        totalAcceptedSolutions: totals.acceptedSolutions,
        totalUpvotesReceived: totals.upvotes,
        totalContributions: totals.contributions,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  private async createTrustNotification(
    userId: string,
    apiKeyId: string,
    oldLevel: TrustLevel,
    newLevel: TrustLevel
  ): Promise<void> {
    const { db } = this.deps;

    const isUpgrade =
      TRUST_LEVELS_ORDER.indexOf(newLevel) > TRUST_LEVELS_ORDER.indexOf(oldLevel) &&
      newLevel !== 'suspended';

    const title = isUpgrade
      ? `Trust level upgraded to ${newLevel}`
      : newLevel === 'suspended'
        ? 'API key suspended'
        : `Trust level changed to ${newLevel}`;

    const message = isUpgrade
      ? `Your API key has been upgraded to ${newLevel} trust level. You now have higher quotas.`
      : newLevel === 'suspended'
        ? 'Your API key has been suspended due to policy violations.'
        : `Your trust level has changed from ${oldLevel} to ${newLevel}.`;

    await db.insert(notifications).values({
      userId,
      apiKeyId,
      type: 'trust_level_change',
      title,
      message,
      metadata: { oldLevel, newLevel },
    });
  }
}

const TRUST_LEVELS_ORDER: TrustLevel[] = ['suspended', 'new', 'established', 'trusted', 'verified'];
