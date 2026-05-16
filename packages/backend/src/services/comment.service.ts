import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { solutions, comments, issues, organizations } from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';
import { QuotaService } from './quota.service.js';
import { TrustService } from './trust.service.js';

export const commentSchema = z.object({
  solution_id: z.string().uuid(),
  comment: z.string().min(1).max(5000),
});

export type CommentInput = z.infer<typeof commentSchema>;

export type CommentResponse = {
  comment_id: string;
};

export class CommentService {
  private quotaService: QuotaService;
  private trustService: TrustService;
  private publicOrgId: string | null | undefined = undefined;

  constructor(private deps: ServiceDependencies) {
    this.quotaService = new QuotaService(deps);
    this.trustService = new TrustService(deps);
  }

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

  async addComment(
    input: CommentInput,
    userId: string,
    organizationId: string,
    apiKeyId?: string,
    agentId?: string
  ): Promise<CommentResponse> {
    const startTime = Date.now();
    const { db } = this.deps;
    const { solution_id, comment } = input;

    try {
      // Check quota if submitting via API key
      if (apiKeyId) {
        const quotaCheck = await this.quotaService.checkQuota(apiKeyId, 'comment');
        if (!quotaCheck.allowed) {
          const error = new Error('QUOTA_EXCEEDED') as Error & {
            quotaInfo: typeof quotaCheck;
          };
          error.quotaInfo = quotaCheck;
          throw error;
        }
      }

      const [solutionWithIssue] = await db
        .select({
          id: solutions.id,
          issueOrgId: issues.organizationId,
        })
        .from(solutions)
        .innerJoin(issues, eq(solutions.issueId, issues.id))
        .where(eq(solutions.id, solution_id))
        .limit(1);

      if (!solutionWithIssue) {
        logger.warn('Comment failed: solution not found', { solutionId: solution_id, userId });
        trackError(OPERATIONS.COMMENT_ADD, 'SOLUTION_NOT_FOUND');
        throw new Error('SOLUTION_NOT_FOUND');
      }

      if (
        solutionWithIssue.issueOrgId !== organizationId &&
        solutionWithIssue.issueOrgId !== (await this.getPublicOrgId())
      ) {
        logger.warn('Comment failed: solution belongs to different organization', {
          solutionId: solution_id,
          userId,
          solutionOrgId: solutionWithIssue.issueOrgId,
          userOrgId: organizationId,
        });
        trackError(OPERATIONS.COMMENT_ADD, 'ORG_MISMATCH');
        throw new ForbiddenError('Solution does not belong to your organization');
      }

      const created = await db.transaction(async tx => {
        const [txCreated] = await tx
          .insert(comments)
          .values({
            solutionId: solution_id,
            authorId: userId,
            authorApiKeyId: apiKeyId ?? null,
            authorAgentId: agentId ?? null,
            content: comment,
          })
          .returning({ id: comments.id });

        if (!txCreated) {
          logger.error('Comment creation failed: database insert returned empty', {
            solutionId: solution_id,
            userId,
          });
          trackError(OPERATIONS.COMMENT_ADD, 'DB_INSERT_FAILED');
          throw new Error('Failed to create comment');
        }

        await tx
          .update(solutions)
          .set({ commentCount: sql`${solutions.commentCount} + 1` })
          .where(eq(solutions.id, solution_id));

        // Track quota and trust stats
        if (apiKeyId) {
          await this.quotaService.incrementUsage(apiKeyId, 'comment');
          await this.trustService.incrementStat(apiKeyId, 'commentsCreated', 1);
          await this.trustService.updateUserReputationFromApiKeys(userId);
        }

        return txCreated;
      });

      const durationMs = Date.now() - startTime;
      logger.info('Comment created successfully', {
        commentId: created.id,
        solutionId: solution_id,
        userId,
        durationMs,
      });
      trackSuccess(OPERATIONS.COMMENT_ADD, durationMs);

      return { comment_id: created.id };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message !== 'SOLUTION_NOT_FOUND' &&
        err.message !== 'Failed to create comment' &&
        !err.message.includes('QUOTA_EXCEEDED')
      ) {
        logger.logError('Unexpected error in comment creation', err, {
          solutionId: solution_id,
          userId,
        });
        trackError(OPERATIONS.COMMENT_ADD, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async getComment(
    commentId: string
  ): Promise<{ id: string; authorId: string; solutionId: string } | null> {
    const { db } = this.deps;
    const [comment] = await db
      .select({ id: comments.id, authorId: comments.authorId, solutionId: comments.solutionId })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    return comment ?? null;
  }

  async deleteComment(commentId: string): Promise<boolean> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [comment] = await db
        .select({ solutionId: comments.solutionId })
        .from(comments)
        .where(eq(comments.id, commentId))
        .limit(1);

      if (!comment) {
        return false;
      }

      await db.transaction(async tx => {
        await tx.delete(comments).where(eq(comments.id, commentId));

        await tx
          .update(solutions)
          .set({ commentCount: sql`GREATEST(${solutions.commentCount} - 1, 0)` })
          .where(eq(solutions.id, comment.solutionId));
      });

      const durationMs = Date.now() - startTime;
      logger.info('Comment deleted successfully', { commentId, durationMs });
      trackSuccess(OPERATIONS.COMMENT_ADD, durationMs);

      return true;
    } catch (err) {
      logger.logError('Failed to delete comment', err, { commentId });
      trackError(OPERATIONS.COMMENT_ADD, 'DELETE_FAILED');
      throw err;
    }
  }
}
