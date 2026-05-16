import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization } from '../auth/index.js';
import { suggest, suggestSchema, type SuggestResponse } from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = suggestSchema.safeParse(req.body);

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
      const result: SuggestResponse = await suggest(
        parseResult.data,
        req.userId,
        req.organizationId,
        req.apiKeyId,
        req.agentId
      );
      metrics.trackKpi(KPI_EVENTS.SUGGESTION_CREATED, req.userId, req.organizationId, {
        issueId: parseResult.data.issue_id,
        solutionId: result.solution_id,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'ISSUE_NOT_FOUND') {
        res.status(404).json({ error: 'Issue not found' });
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
          contentType: 'solution',
        });
        res.status(429).json({
          error: 'Daily quota exceeded',
          limit: quotaError.quotaInfo?.limit,
          used: quotaError.quotaInfo?.used,
          resetsAt: quotaError.quotaInfo?.resetsAt,
        });
        return;
      }
      logger.logError('Suggestion creation failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        issueId: parseResult.data.issue_id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const suggestRouter: Router = router;
