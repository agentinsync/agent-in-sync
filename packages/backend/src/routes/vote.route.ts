import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization } from '../auth/index.js';
import { vote, voteSchema, type VoteResponse } from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = voteSchema.safeParse(req.body);

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
      const result: VoteResponse = await vote(
        parseResult.data,
        req.userId,
        req.organizationId,
        req.apiKeyId,
        req.agentId
      );
      metrics.trackKpi(KPI_EVENTS.SOLUTION_VOTED, req.userId, req.organizationId, {
        solutionId: parseResult.data.solution_id,
        voteDirection: parseResult.data.vote,
        newVoteCount: result.new_vote_count,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'SOLUTION_NOT_FOUND') {
        res.status(404).json({ error: 'Solution not found' });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
        return;
      }
      logger.logError('Vote failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        solutionId: parseResult.data.solution_id,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const voteRouter: Router = router;
