import { eq, desc, and, isNull } from 'drizzle-orm';
import { notifications } from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { logger } from '../observability/index.js';

export type NotificationType =
  | 'solution_accepted'
  | 'trust_level_change'
  | 'content_flagged'
  | 'content_approved'
  | 'content_rejected'
  | 'upvote_received'
  | 'downvote_received';

export type NotificationMetadata = {
  solutionId?: string;
  issueId?: string;
  contentType?: 'issue' | 'solution' | 'comment';
  contentId?: string;
  oldTrustLevel?: string;
  newTrustLevel?: string;
  trustDelta?: number;
  voteCount?: number;
  [key: string]: unknown;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  metadata: NotificationMetadata | null;
  readAt: Date | null;
  createdAt: Date;
};

export type CreateNotificationInput = {
  userId: string;
  apiKeyId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  metadata?: NotificationMetadata;
};

export class NotificationService {
  constructor(private deps: ServiceDependencies) {}

  async create(input: CreateNotificationInput): Promise<string> {
    const { db } = this.deps;
    const { userId, apiKeyId, type, title, message, metadata } = input;

    try {
      const [notification] = await db
        .insert(notifications)
        .values({
          userId,
          apiKeyId: apiKeyId ?? null,
          type,
          title,
          message: message ?? null,
          metadata: metadata ?? null,
        })
        .returning({ id: notifications.id });

      if (!notification) {
        throw new Error('Failed to create notification');
      }

      logger.debug('Notification created', { notificationId: notification.id, type, userId });
      return notification.id;
    } catch (err) {
      logger.logError('Failed to create notification', err, { userId, type });
      throw err;
    }
  }

  async getUnread(userId: string, limit = 50): Promise<Notification[]> {
    const { db } = this.deps;

    const results = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        metadata: notifications.metadata,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return results.map(r => ({
      ...r,
      metadata: r.metadata as NotificationMetadata | null,
    }));
  }

  async getAll(userId: string, limit = 50, offset = 0): Promise<Notification[]> {
    const { db } = this.deps;

    const results = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        metadata: notifications.metadata,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return results.map(r => ({
      ...r,
      metadata: r.metadata as NotificationMetadata | null,
    }));
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const { db } = this.deps;

    const result = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });

    return result.length > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const { db } = this.deps;

    const result = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });

    return result.length;
  }

  async getUnreadCount(userId: string): Promise<number> {
    const { db } = this.deps;

    const result = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

    return result.length;
  }

  async notifySolutionAccepted(
    userId: string,
    apiKeyId: string | undefined,
    solutionId: string,
    issueId: string
  ): Promise<void> {
    await this.create({
      userId,
      apiKeyId,
      type: 'solution_accepted',
      title: 'Your solution was accepted!',
      message: 'The issue author marked your solution as the accepted answer.',
      metadata: { solutionId, issueId, trustDelta: 10 },
    });
  }

  async notifyTrustLevelChange(
    userId: string,
    apiKeyId: string,
    oldLevel: string,
    newLevel: string
  ): Promise<void> {
    const newLevelOrder = ['established', 'trusted', 'verified'].indexOf(newLevel);
    const oldLevelOrder = ['new', 'established', 'trusted', 'verified'].indexOf(oldLevel);
    const isUpgrade = newLevelOrder > oldLevelOrder;

    const title = isUpgrade
      ? `Trust level upgraded to ${newLevel}!`
      : `Trust level changed to ${newLevel}`;

    const message = isUpgrade
      ? 'Congratulations! Your consistent quality contributions earned you a higher trust level.'
      : 'Your trust level has changed based on recent activity.';

    await this.create({
      userId,
      apiKeyId,
      type: 'trust_level_change',
      title,
      message,
      metadata: { oldTrustLevel: oldLevel, newTrustLevel: newLevel },
    });
  }

  async notifyContentFlagged(
    userId: string,
    apiKeyId: string | undefined,
    contentType: 'issue' | 'solution' | 'comment',
    contentId: string
  ): Promise<void> {
    await this.create({
      userId,
      apiKeyId,
      type: 'content_flagged',
      title: `Your ${contentType} was flagged for review`,
      message: 'Community members flagged your content. It will be reviewed by moderators.',
      metadata: { contentType, contentId },
    });
  }

  async notifyContentModerated(
    userId: string,
    apiKeyId: string | undefined,
    contentType: 'issue' | 'solution' | 'comment',
    contentId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    await this.create({
      userId,
      apiKeyId,
      type: approved ? 'content_approved' : 'content_rejected',
      title: approved ? `Your ${contentType} was approved` : `Your ${contentType} was rejected`,
      message: approved
        ? 'A moderator approved your content. It is now visible to others.'
        : `A moderator rejected your content. Reason: ${reason ?? 'Not specified'}`,
      metadata: { contentType, contentId },
    });
  }
}
