import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization, requireReviewer } from '../auth/index.js';
import {
  createShareRequest,
  createShareRequestSchema,
  getPendingShareRequests,
  getApprovedShareRequests,
  getShareRequest,
  approveShareRequest,
  approveShareRequestSchema,
  rejectShareRequest,
  rejectShareRequestSchema,
  revokeShareRequest,
} from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { parseUuid } from '../utils/index.js';
import { ValidationError } from '../errors/index.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = createShareRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const result = await createShareRequest(
        parseResult.data,
        req.userId,
        req.organizationId,
        req.membershipRole
      );
      const trackId = 'id' in result ? result.id : result.shareRequestId;
      metrics.trackKpi(KPI_EVENTS.SHARE_REQUEST_CREATED, req.userId, req.organizationId, {
        shareRequestId: trackId,
        issueId: parseResult.data.issueId,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('not found') || err.message.includes('does not belong')) {
          res.status(404).json({ error: err.message });
          return;
        }
        if (err.message.includes('Cannot request') || err.message.includes('already exists')) {
          res.status(400).json({ error: err.message });
          return;
        }
      }
      logger.logError('Create share request failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Organization required' });
      return;
    }

    try {
      const requests = await getPendingShareRequests(req.organizationId);
      res.json({ requests });
    } catch (err) {
      logger.logError('Get pending share requests failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/approved',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Organization required' });
      return;
    }

    try {
      const requests = await getApprovedShareRequests(req.organizationId);
      res.json({ requests });
    } catch (err) {
      logger.logError('Get approved share requests failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:id',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = parseUuid(req.params.id as string, 'id');
      const request = await getShareRequest(id);
      if (!request) {
        res.status(404).json({ error: 'Share request not found' });
        return;
      }

      if (request.issueOrganizationId !== req.organizationId) {
        res.status(403).json({ error: 'Not authorized to view this share request' });
        return;
      }

      res.json(request);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.logError('Get share request failed', err, {
        requestId: req.requestId,
        shareRequestId: req.params.id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/approve',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const id = parseUuid(req.params.id as string, 'id');
      const parseResult = approveShareRequestSchema.safeParse(req.body ?? {});
      const reason = parseResult.success ? parseResult.data.reason : undefined;
      const result = await approveShareRequest(id, req.userId, req.organizationId, reason);
      metrics.trackKpi(KPI_EVENTS.SHARE_REQUEST_APPROVED, req.userId, req.organizationId, {
        shareRequestId: id,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        if (err.message.includes('not found')) {
          res.status(404).json({ error: err.message });
          return;
        }
        if (
          err.message.includes('does not belong') ||
          err.message.includes('already been processed')
        ) {
          res.status(400).json({ error: err.message });
          return;
        }
      }
      logger.logError('Approve share request failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        shareRequestId: req.params.id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/reject',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = rejectShareRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const id = parseUuid(req.params.id as string, 'id');
      await rejectShareRequest(id, req.userId, parseResult.data, req.organizationId);
      metrics.trackKpi(KPI_EVENTS.SHARE_REQUEST_REJECTED, req.userId, req.organizationId, {
        shareRequestId: id,
        reason: parseResult.data.reason,
      });
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        if (err.message.includes('not found')) {
          res.status(404).json({ error: err.message });
          return;
        }
        if (
          err.message.includes('does not belong') ||
          err.message.includes('already been processed')
        ) {
          res.status(400).json({ error: err.message });
          return;
        }
      }
      logger.logError('Reject share request failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        shareRequestId: req.params.id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/:id/revoke',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const id = parseUuid(req.params.id as string, 'id');
      const parseResult = approveShareRequestSchema.safeParse(req.body ?? {});
      const reason = parseResult.success ? parseResult.data.reason : undefined;
      await revokeShareRequest(id, req.userId, req.organizationId, reason);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        if (err.message.includes('not found')) {
          res.status(404).json({ error: err.message });
          return;
        }
        if (
          err.message.includes('does not belong') ||
          err.message.includes('Only approved') ||
          err.message.includes('Active shared content')
        ) {
          res.status(400).json({ error: err.message });
          return;
        }
      }
      logger.logError('Revoke share request failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        shareRequestId: req.params.id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const shareRequestRouter: Router = router;
