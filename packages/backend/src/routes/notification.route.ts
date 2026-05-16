import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { NotificationService } from '../services/notification.service.js';
import { getDb } from '@agent-in-sync/db-client';
import { logger } from '../observability/index.js';

const router = Router();

const getNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  unread_only: z.coerce.boolean().optional().default(false),
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parseResult = getNotificationsSchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten(),
    });
    return;
  }

  const { limit, offset, unread_only } = parseResult.data;

  try {
    const notificationService = new NotificationService({ db: getDb() });
    const notifications = unread_only
      ? await notificationService.getUnread(req.userId, limit)
      : await notificationService.getAll(req.userId, limit, offset);

    const unreadCount = await notificationService.getUnreadCount(req.userId);

    res.json({
      notifications,
      unread_count: unreadCount,
      total: notifications.length,
    });
  } catch (err) {
    logger.logError('Failed to get notifications', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/read', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const notificationId = req.params.id as string;
  if (!notificationId) {
    res.status(400).json({ error: 'Notification ID required' });
    return;
  }

  try {
    const notificationService = new NotificationService({ db: getDb() });
    const success = await notificationService.markAsRead(notificationId, req.userId);

    if (!success) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    logger.logError('Failed to mark notification as read', err, {
      requestId: req.requestId,
      userId: req.userId,
      notificationId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/read-all', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const notificationService = new NotificationService({ db: getDb() });
    const count = await notificationService.markAllAsRead(req.userId);

    res.json({ success: true, marked_count: count });
  } catch (err) {
    logger.logError('Failed to mark all notifications as read', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const notificationRouter: Router = router;
