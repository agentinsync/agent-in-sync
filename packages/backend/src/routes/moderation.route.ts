import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization, requireReviewer } from '../auth/index.js';
import { flagContentInputSchema, moderationActionInputSchema } from '@agent-in-sync/shared';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { ModerationService } from '../services/moderation.service.js';
import { getDb } from '@agent-in-sync/db-client';
import { getWeaviateClient } from '../weaviate/index.js';

const router = Router();

async function getModerationService(): Promise<ModerationService> {
  const db = getDb();
  const weaviateClient = await getWeaviateClient();
  return new ModerationService({ db, weaviateClient });
}

router.get(
  '/moderation/queue',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const moderationService = await getModerationService();
      const result = await moderationService.getPendingQueue(req.organizationId!);
      res.json(result);
    } catch (err) {
      logger.logError('Get moderation queue failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/moderation/:contentType/:contentId/approve',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    const contentType = req.params.contentType as string;
    const contentId = req.params.contentId as string;

    if (!['issue', 'solution', 'comment'].includes(contentType)) {
      res.status(400).json({ error: 'Invalid content type' });
      return;
    }

    try {
      const moderationService = await getModerationService();
      await moderationService.approveContent(
        contentType as 'issue' | 'solution' | 'comment',
        contentId,
        req.userId!,
        req.organizationId!
      );

      metrics.trackKpi(KPI_EVENTS.CONTENT_APPROVED, req.userId, req.organizationId, {
        contentType,
        contentId,
      });

      res.json({ success: true, status: 'approved' });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Content not found') {
          res.status(404).json({ error: 'Content not found' });
          return;
        }
        if (err.message === 'Content does not belong to this organization') {
          res.status(403).json({ error: 'Content does not belong to this organization' });
          return;
        }
      }
      logger.logError('Approve content failed', err, {
        requestId: req.requestId,
        contentType,
        contentId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/moderation/:contentType/:contentId/reject',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    const contentType = req.params.contentType as string;
    const contentId = req.params.contentId as string;

    if (!['issue', 'solution', 'comment'].includes(contentType)) {
      res.status(400).json({ error: 'Invalid content type' });
      return;
    }

    const parseResult = moderationActionInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const moderationService = await getModerationService();
      await moderationService.rejectContent(
        contentType as 'issue' | 'solution' | 'comment',
        contentId,
        req.userId!,
        req.organizationId!,
        parseResult.data.rejection_reason
      );

      metrics.trackKpi(KPI_EVENTS.CONTENT_REJECTED, req.userId, req.organizationId, {
        contentType,
        contentId,
        reason: parseResult.data.rejection_reason,
      });

      res.json({ success: true, status: 'rejected' });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Content not found') {
          res.status(404).json({ error: 'Content not found' });
          return;
        }
        if (err.message === 'Content does not belong to this organization') {
          res.status(403).json({ error: 'Content does not belong to this organization' });
          return;
        }
      }
      logger.logError('Reject content failed', err, {
        requestId: req.requestId,
        contentType,
        contentId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/flag',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = flagContentInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const moderationService = await getModerationService();
      const result = await moderationService.flagContent(
        parseResult.data,
        req.userId!,
        req.organizationId!,
        req.apiKeyId
      );

      metrics.trackKpi(KPI_EVENTS.CONTENT_FLAGGED, req.userId, req.organizationId, {
        contentType: parseResult.data.content_type,
        contentId: parseResult.data.content_id,
        reason: parseResult.data.reason,
        autoFlagged: result.flagged,
      });

      res.json({
        success: true,
        flagCount: result.flagCount,
        autoFlagged: result.flagged,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Content not found') {
          res.status(404).json({ error: 'Content not found' });
          return;
        }
        if (err.message === 'Content does not belong to this organization') {
          res.status(403).json({ error: 'Content does not belong to this organization' });
          return;
        }
        if (err.message === 'Already flagged this content') {
          res.status(409).json({ error: 'You have already flagged this content' });
          return;
        }
      }
      logger.logError('Flag content failed', err, {
        requestId: req.requestId,
        contentType: parseResult.data.content_type,
        contentId: parseResult.data.content_id,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const moderationRouter: Router = router;
