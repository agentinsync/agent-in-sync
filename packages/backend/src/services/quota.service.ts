import { eq, sql } from 'drizzle-orm';
import { apiKeys } from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import type { TrustLevel } from '@agent-in-sync/shared';

type ContentType = 'issue' | 'solution' | 'comment';

type DailyQuotas = {
  issues: number;
  solutions: number;
  comments: number;
};

const QUOTAS: Record<TrustLevel, DailyQuotas> = {
  new: { issues: 5, solutions: 10, comments: 20 },
  established: { issues: 20, solutions: 50, comments: 100 },
  trusted: { issues: 100, solutions: 200, comments: 500 },
  verified: { issues: 500, solutions: 1000, comments: 2000 },
  suspended: { issues: 0, solutions: 0, comments: 0 },
};

export type QuotaCheckResult = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: Date;
};

export class QuotaService {
  constructor(private deps: ServiceDependencies) {}

  async checkQuota(apiKeyId: string, contentType: ContentType): Promise<QuotaCheckResult> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [apiKey] = await db
        .select({
          trustLevel: apiKeys.trustLevel,
          dailyIssuesCreated: apiKeys.dailyIssuesCreated,
          dailySolutionsCreated: apiKeys.dailySolutionsCreated,
          dailyCommentsCreated: apiKeys.dailyCommentsCreated,
          quotaResetAt: apiKeys.quotaResetAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.id, apiKeyId))
        .limit(1);

      if (!apiKey) {
        return {
          allowed: false,
          limit: 0,
          used: 0,
          remaining: 0,
          resetsAt: new Date(),
        };
      }

      const trustLevel = apiKey.trustLevel as TrustLevel;
      const quotas = QUOTAS[trustLevel];

      // Check if we need to reset the daily quota
      const now = new Date();
      const resetAt = apiKey.quotaResetAt ? new Date(apiKey.quotaResetAt) : now;
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);

      let used: number;
      let limit: number;

      if (hoursSinceReset >= 24) {
        // Quota has reset, so current usage is 0
        await db
          .update(apiKeys)
          .set({
            dailyIssuesCreated: 0,
            dailySolutionsCreated: 0,
            dailyCommentsCreated: 0,
            quotaResetAt: now,
          })
          .where(eq(apiKeys.id, apiKeyId));
        used = 0;
      } else {
        switch (contentType) {
          case 'issue':
            used = apiKey.dailyIssuesCreated;
            break;
          case 'solution':
            used = apiKey.dailySolutionsCreated;
            break;
          case 'comment':
            used = apiKey.dailyCommentsCreated;
            break;
        }
      }

      switch (contentType) {
        case 'issue':
          limit = quotas.issues;
          break;
        case 'solution':
          limit = quotas.solutions;
          break;
        case 'comment':
          limit = quotas.comments;
          break;
      }

      const remaining = Math.max(0, limit - used);
      const allowed = used < limit;

      // Calculate next reset time (24 hours from last reset)
      const nextReset = new Date(hoursSinceReset >= 24 ? now : resetAt);
      nextReset.setHours(nextReset.getHours() + 24);

      trackSuccess(OPERATIONS.QUOTA_CHECK, Date.now() - startTime);

      return {
        allowed,
        limit,
        used,
        remaining,
        resetsAt: nextReset,
      };
    } catch (err) {
      logger.logError('Failed to check quota', err, { apiKeyId, contentType });
      trackError(OPERATIONS.QUOTA_CHECK, 'CHECK_FAILED');
      throw err;
    }
  }

  async incrementUsage(apiKeyId: string, contentType: ContentType): Promise<void> {
    const { db } = this.deps;

    // First check if quota needs reset
    const [apiKey] = await db
      .select({ quotaResetAt: apiKeys.quotaResetAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);

    const now = new Date();

    if (apiKey?.quotaResetAt) {
      const resetAt = new Date(apiKey.quotaResetAt);
      const hoursSinceReset = (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceReset >= 24) {
        await db
          .update(apiKeys)
          .set({
            dailyIssuesCreated: contentType === 'issue' ? 1 : 0,
            dailySolutionsCreated: contentType === 'solution' ? 1 : 0,
            dailyCommentsCreated: contentType === 'comment' ? 1 : 0,
            quotaResetAt: now,
          })
          .where(eq(apiKeys.id, apiKeyId));
        return;
      }
    }

    // Increment the specific counter using SQL
    switch (contentType) {
      case 'issue':
        await db
          .update(apiKeys)
          .set({ dailyIssuesCreated: sql`${apiKeys.dailyIssuesCreated} + 1` })
          .where(eq(apiKeys.id, apiKeyId));
        break;
      case 'solution':
        await db
          .update(apiKeys)
          .set({ dailySolutionsCreated: sql`${apiKeys.dailySolutionsCreated} + 1` })
          .where(eq(apiKeys.id, apiKeyId));
        break;
      case 'comment':
        await db
          .update(apiKeys)
          .set({ dailyCommentsCreated: sql`${apiKeys.dailyCommentsCreated} + 1` })
          .where(eq(apiKeys.id, apiKeyId));
        break;
    }
  }

  getQuotasForTrustLevel(trustLevel: TrustLevel): DailyQuotas {
    return QUOTAS[trustLevel];
  }
}
