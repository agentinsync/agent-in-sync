import { Router, type Request, type Response } from 'express';
import { getDb } from '@agent-in-sync/db-client';
import { acceptConsentSchema } from '@agent-in-sync/shared';
import { requireAuth } from '../auth/index.js';
import { exportLimiter } from '../middleware/index.js';
import { PrivacyService } from '../services/privacy.service.js';
import { logger } from '../observability/index.js';

const router = Router();

router.post('/consent', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const parsed = acceptConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    return;
  }

  try {
    const service = new PrivacyService({ db: getDb() });
    await service.recordConsent(
      req.userId,
      parsed.data,
      req.ip ?? undefined,
      req.headers['user-agent']
    );
    res.json({ ok: true });
  } catch (err) {
    logger.logError('Failed to record consent', err, { userId: req.userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/consent/status', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const service = new PrivacyService({ db: getDb() });
    const consentCurrent = await service.hasCurrentConsent(req.userId);
    res.json({ consentCurrent });
  } catch (err) {
    logger.logError('Failed to check consent status', err, { userId: req.userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/export',
  requireAuth,
  exportLimiter,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const service = new PrivacyService({ db: getDb() });
      const data = await service.exportUserData(req.userId);
      res.setHeader('Content-Disposition', 'attachment; filename="my-data-export.json"');
      res.json(data);
    } catch (err) {
      logger.logError('Failed to export user data', err, { userId: req.userId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/deletion-request',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const service = new PrivacyService({ db: getDb() });
      const result = await service.requestDeletion(req.userId);
      res.json({ token: result.token, expiresAt: result.expiresAt.toISOString() });
    } catch (err) {
      if (err instanceof Error && err.message === 'DELETION_ALREADY_REQUESTED') {
        res.status(409).json({ error: 'A deletion request is already pending' });
        return;
      }
      logger.logError('Failed to request deletion', err, { userId: req.userId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/deletion-request/status',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const service = new PrivacyService({ db: getDb() });
      const status = await service.getDeletionStatus(req.userId);
      res.json(status);
    } catch (err) {
      logger.logError('Failed to get deletion status', err, { userId: req.userId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/deletion-request/cancel',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const service = new PrivacyService({ db: getDb() });
      await service.cancelDeletion(req.userId);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof Error && err.message === 'NO_PENDING_DELETION') {
        res.status(404).json({ error: 'No pending deletion request found' });
        return;
      }
      logger.logError('Failed to cancel deletion', err, { userId: req.userId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/deletion-request/confirm',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string') {
      res.status(400).json({ error: 'Confirmation token is required' });
      return;
    }

    try {
      const service = new PrivacyService({ db: getDb() });
      await service.confirmDeletion(req.userId, token);
      res.json({ ok: true, message: 'Account has been deleted' });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'INVALID_DELETION_TOKEN') {
          res.status(400).json({ error: 'Invalid or expired deletion token' });
          return;
        }
        if (err.message === 'DELETION_TOKEN_EXPIRED') {
          res.status(410).json({ error: 'Deletion token has expired' });
          return;
        }
      }
      logger.logError('Failed to confirm deletion', err, { userId: req.userId });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const privacyRouter: Router = router;
