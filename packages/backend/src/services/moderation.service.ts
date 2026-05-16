import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import {
  issues,
  solutions,
  comments,
  contentFlags,
  users,
  apiKeys,
  notifications,
} from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import { TrustService } from './trust.service.js';
import { NotFoundError, ForbiddenError } from '../errors/index.js';
import type {
  ContentType,
  FlagContentInput,
  PendingContent,
  ModerationQueueResponse,
} from '@agent-in-sync/shared';

const AUTO_FLAG_THRESHOLD = 3;

export class ModerationService {
  private trustService: TrustService;

  constructor(private deps: ServiceDependencies) {
    this.trustService = new TrustService(deps);
  }

  async getPendingQueue(organizationId: string): Promise<ModerationQueueResponse> {
    const { db } = this.deps;

    const pendingIssues = await db
      .select({
        id: issues.id,
        title: issues.title,
        content: issues.description,
        authorId: issues.authorId,
        authorEmail: users.email,
        authorName: users.name,
        authorTrustLevel: apiKeys.trustLevel,
        createdAt: issues.createdAt,
      })
      .from(issues)
      .leftJoin(users, eq(issues.authorId, users.id))
      .leftJoin(apiKeys, eq(issues.authorApiKeyId, apiKeys.id))
      .where(
        and(
          eq(issues.organizationId, organizationId),
          eq(issues.status, 'pending'),
          isNull(issues.deletedAt)
        )
      )
      .orderBy(desc(issues.createdAt));

    const pendingSolutions = await db
      .select({
        id: solutions.id,
        content: solutions.content,
        authorId: solutions.authorId,
        authorEmail: users.email,
        authorName: users.name,
        authorTrustLevel: apiKeys.trustLevel,
        createdAt: solutions.createdAt,
        issueOrgId: issues.organizationId,
      })
      .from(solutions)
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .leftJoin(users, eq(solutions.authorId, users.id))
      .leftJoin(apiKeys, eq(solutions.authorApiKeyId, apiKeys.id))
      .where(
        and(
          eq(issues.organizationId, organizationId),
          eq(solutions.status, 'pending'),
          isNull(solutions.deletedAt)
        )
      )
      .orderBy(desc(solutions.createdAt));

    const pendingComments = await db
      .select({
        id: comments.id,
        content: comments.content,
        authorId: comments.authorId,
        authorEmail: users.email,
        authorName: users.name,
        authorTrustLevel: apiKeys.trustLevel,
        createdAt: comments.createdAt,
        issueOrgId: issues.organizationId,
      })
      .from(comments)
      .innerJoin(solutions, eq(comments.solutionId, solutions.id))
      .innerJoin(issues, eq(solutions.issueId, issues.id))
      .leftJoin(users, eq(comments.authorId, users.id))
      .leftJoin(apiKeys, eq(comments.authorApiKeyId, apiKeys.id))
      .where(
        and(
          eq(issues.organizationId, organizationId),
          eq(comments.status, 'pending'),
          isNull(comments.deletedAt)
        )
      )
      .orderBy(desc(comments.createdAt));

    const items: PendingContent[] = [
      ...pendingIssues.map(i => ({
        id: i.id,
        contentType: 'issue' as ContentType,
        title: i.title,
        content: i.content,
        authorId: i.authorId,
        authorEmail: i.authorEmail ?? undefined,
        authorName: i.authorName ?? undefined,
        authorTrustLevel: i.authorTrustLevel ?? undefined,
        createdAt: i.createdAt.toISOString(),
      })),
      ...pendingSolutions.map(s => ({
        id: s.id,
        contentType: 'solution' as ContentType,
        content: s.content,
        authorId: s.authorId,
        authorEmail: s.authorEmail ?? undefined,
        authorName: s.authorName ?? undefined,
        authorTrustLevel: s.authorTrustLevel ?? undefined,
        createdAt: s.createdAt.toISOString(),
      })),
      ...pendingComments.map(c => ({
        id: c.id,
        contentType: 'comment' as ContentType,
        content: c.content,
        authorId: c.authorId,
        authorEmail: c.authorEmail ?? undefined,
        authorName: c.authorName ?? undefined,
        authorTrustLevel: c.authorTrustLevel ?? undefined,
        createdAt: c.createdAt.toISOString(),
      })),
    ];

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { items, total: items.length };
  }

  async approveContent(
    contentType: ContentType,
    contentId: string,
    moderatorId: string,
    organizationId: string
  ): Promise<{ approved: boolean }> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const table = this.getTable(contentType);
      const content = await this.getContent(contentType, contentId);

      if (!content) {
        throw new NotFoundError(contentType);
      }

      await this.verifyOrganization(contentType, contentId, organizationId);

      await db
        .update(table)
        .set({
          status: 'approved',
          moderatedBy: moderatorId,
          moderatedAt: new Date(),
        })
        .where(eq(table.id, contentId));

      logger.info('Content approved', { contentType, contentId, moderatorId });
      trackSuccess(OPERATIONS.MODERATION_APPROVE, Date.now() - startTime);

      return { approved: true };
    } catch (err) {
      if (!(err instanceof NotFoundError) && !(err instanceof ForbiddenError)) {
        logger.logError('Failed to approve content', err, { contentType, contentId, moderatorId });
        trackError(OPERATIONS.MODERATION_APPROVE, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async rejectContent(
    contentType: ContentType,
    contentId: string,
    moderatorId: string,
    organizationId: string,
    reason?: string
  ): Promise<{ rejected: boolean }> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const table = this.getTable(contentType);
      const content = await this.getContent(contentType, contentId);

      if (!content) {
        throw new NotFoundError(contentType);
      }

      await this.verifyOrganization(contentType, contentId, organizationId);

      await db.transaction(async tx => {
        await tx
          .update(table)
          .set({
            status: 'rejected',
            moderatedBy: moderatorId,
            moderatedAt: new Date(),
            rejectionReason: reason ?? null,
          })
          .where(eq(table.id, contentId));

        // Increment rejected submissions on author's API key
        if (content.authorApiKeyId) {
          await this.trustService.incrementStat(content.authorApiKeyId, 'rejectedSubmissions', 1);
          await this.trustService.checkTrustLevelTransition(content.authorApiKeyId);
          await this.trustService.updateUserReputationFromApiKeys(content.authorId);

          // Notify author
          await tx.insert(notifications).values({
            userId: content.authorId,
            apiKeyId: content.authorApiKeyId,
            type: 'content_rejected',
            title: 'Content rejected',
            message: reason
              ? `Your ${contentType} was rejected: ${reason}`
              : `Your ${contentType} was rejected by a reviewer.`,
            metadata: { contentType, contentId, reason },
          });
        }
      });

      logger.info('Content rejected', { contentType, contentId, moderatorId, reason });
      trackSuccess(OPERATIONS.MODERATION_REJECT, Date.now() - startTime);

      return { rejected: true };
    } catch (err) {
      if (!(err instanceof NotFoundError) && !(err instanceof ForbiddenError)) {
        logger.logError('Failed to reject content', err, { contentType, contentId, moderatorId });
        trackError(OPERATIONS.MODERATION_REJECT, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async flagContent(
    input: FlagContentInput,
    reporterId: string,
    organizationId: string,
    reporterApiKeyId?: string
  ): Promise<{ flagged: boolean; flagCount: number }> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const { content_type, content_id, reason, details } = input;

      const content = await this.getContent(content_type, content_id);
      if (!content) {
        throw new NotFoundError(content_type);
      }

      await this.verifyOrganization(content_type, content_id, organizationId);

      // Check if already flagged by this user
      const [existingFlag] = await db
        .select({ id: contentFlags.id })
        .from(contentFlags)
        .where(
          and(
            eq(contentFlags.contentType, content_type),
            eq(contentFlags.contentId, content_id),
            eq(contentFlags.reporterId, reporterId)
          )
        )
        .limit(1);

      if (existingFlag) {
        const flagCount = await this.getFlagCount(content_type, content_id);
        return { flagged: false, flagCount };
      }

      const flagCount = await db.transaction(async tx => {
        await tx.insert(contentFlags).values({
          contentType: content_type,
          contentId: content_id,
          reporterId,
          reporterApiKeyId: reporterApiKeyId ?? null,
          reason,
          details: details ?? null,
        });

        const txFlagCount = await this.getFlagCount(content_type, content_id);

        // Auto-flag content if it reaches threshold
        if (txFlagCount >= AUTO_FLAG_THRESHOLD) {
          const table = this.getTable(content_type);
          await tx.update(table).set({ status: 'flagged' }).where(eq(table.id, content_id));

          // Increment flagged content count on author's API key
          if (content.authorApiKeyId) {
            await this.trustService.incrementStat(content.authorApiKeyId, 'flaggedContent', 1);
            await this.trustService.checkTrustLevelTransition(content.authorApiKeyId);
          }
        }

        return txFlagCount;
      });

      logger.info('Content flagged', {
        contentType: content_type,
        contentId: content_id,
        reporterId,
        reason,
        flagCount,
      });
      trackSuccess(OPERATIONS.MODERATION_FLAG, Date.now() - startTime);

      return { flagged: true, flagCount };
    } catch (err) {
      if (!(err instanceof NotFoundError) && !(err instanceof ForbiddenError)) {
        logger.logError('Failed to flag content', err, { input, reporterId });
        trackError(OPERATIONS.MODERATION_FLAG, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  private getTable(contentType: ContentType) {
    switch (contentType) {
      case 'issue':
        return issues;
      case 'solution':
        return solutions;
      case 'comment':
        return comments;
    }
  }

  private async getContent(
    contentType: ContentType,
    contentId: string
  ): Promise<{ id: string; authorId: string; authorApiKeyId: string | null } | null> {
    const { db } = this.deps;

    switch (contentType) {
      case 'issue': {
        const [issue] = await db
          .select({
            id: issues.id,
            authorId: issues.authorId,
            authorApiKeyId: issues.authorApiKeyId,
          })
          .from(issues)
          .where(eq(issues.id, contentId))
          .limit(1);
        return issue ?? null;
      }
      case 'solution': {
        const [solution] = await db
          .select({
            id: solutions.id,
            authorId: solutions.authorId,
            authorApiKeyId: solutions.authorApiKeyId,
          })
          .from(solutions)
          .where(eq(solutions.id, contentId))
          .limit(1);
        return solution ?? null;
      }
      case 'comment': {
        const [comment] = await db
          .select({
            id: comments.id,
            authorId: comments.authorId,
            authorApiKeyId: comments.authorApiKeyId,
          })
          .from(comments)
          .where(eq(comments.id, contentId))
          .limit(1);
        return comment ?? null;
      }
    }
  }

  private async verifyOrganization(
    contentType: ContentType,
    contentId: string,
    organizationId: string
  ): Promise<void> {
    const { db } = this.deps;

    switch (contentType) {
      case 'issue': {
        const [issue] = await db
          .select({ organizationId: issues.organizationId })
          .from(issues)
          .where(eq(issues.id, contentId))
          .limit(1);
        if (issue?.organizationId !== organizationId) {
          throw new ForbiddenError('Content does not belong to your organization');
        }
        break;
      }
      case 'solution': {
        const [solution] = await db
          .select({ organizationId: issues.organizationId })
          .from(solutions)
          .innerJoin(issues, eq(solutions.issueId, issues.id))
          .where(eq(solutions.id, contentId))
          .limit(1);
        if (solution?.organizationId !== organizationId) {
          throw new ForbiddenError('Content does not belong to your organization');
        }
        break;
      }
      case 'comment': {
        const [comment] = await db
          .select({ organizationId: issues.organizationId })
          .from(comments)
          .innerJoin(solutions, eq(comments.solutionId, solutions.id))
          .innerJoin(issues, eq(solutions.issueId, issues.id))
          .where(eq(comments.id, contentId))
          .limit(1);
        if (comment?.organizationId !== organizationId) {
          throw new ForbiddenError('Content does not belong to your organization');
        }
        break;
      }
    }
  }

  private async getFlagCount(contentType: ContentType, contentId: string): Promise<number> {
    const { db } = this.deps;

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(contentFlags)
      .where(
        and(
          eq(contentFlags.contentType, contentType),
          eq(contentFlags.contentId, contentId),
          isNull(contentFlags.resolvedAt)
        )
      );

    return result?.count ?? 0;
  }
}
