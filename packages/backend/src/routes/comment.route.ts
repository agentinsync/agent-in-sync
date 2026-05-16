import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization, requireOwnership } from '../auth/index.js';
import {
  addComment,
  commentSchema,
  getComment,
  deleteComment,
  type CommentResponse,
} from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { ForbiddenError, ValidationError } from '../errors/index.js';
import { parseUuid } from '../utils/index.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = commentSchema.safeParse(req.body);

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
      const result: CommentResponse = await addComment(
        parseResult.data,
        req.userId,
        req.organizationId,
        req.apiKeyId,
        req.agentId
      );
      metrics.trackKpi(KPI_EVENTS.COMMENT_ADDED, req.userId, req.organizationId, {
        solutionId: parseResult.data.solution_id,
        commentId: result.comment_id,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'SOLUTION_NOT_FOUND') {
        res.status(404).json({ error: 'Solution not found' });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('QUOTA_EXCEEDED')) {
        const quotaError = err as Error & {
          quotaInfo?: { limit: number; used: number; resetsAt: Date };
        };
        metrics.trackKpi(KPI_EVENTS.QUOTA_EXCEEDED, req.userId, req.organizationId, {
          contentType: 'comment',
        });
        res.status(429).json({
          error: 'Daily quota exceeded',
          limit: quotaError.quotaInfo?.limit,
          used: quotaError.quotaInfo?.used,
          resetsAt: quotaError.quotaInfo?.resetsAt,
        });
        return;
      }
      logger.logError('Comment creation failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        solutionId: parseResult.data.solution_id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:commentId',
  requireAuth,
  requireOwnership(async req => {
    const commentId = parseUuid(req.params.commentId as string, 'commentId');
    const comment = await getComment(commentId);
    return comment?.authorId ?? null;
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const commentId = parseUuid(req.params.commentId as string, 'commentId');
      const deleted = await deleteComment(commentId);
      if (!deleted) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.logError('Delete comment failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        commentId: req.params.commentId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const commentRouter: Router = router;
