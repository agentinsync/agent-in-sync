import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization, requireOwnership } from '../auth/index.js';
import {
  submit,
  submitSchema,
  getIssue,
  deleteIssue,
  getSolution,
  deleteSolution,
  acceptSolution,
  type SubmitResponse,
  type DuplicateError,
} from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { parseUuid } from '../utils/index.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors/index.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = submitSchema.safeParse(req.body);

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
      const result: SubmitResponse = await submit(
        parseResult.data,
        req.userId,
        req.organizationId,
        req.apiKeyId,
        req.agentId
      );
      metrics.trackKpi(KPI_EVENTS.ISSUE_SUBMITTED, req.userId, req.organizationId, {
        issueId: result.issue_id,
        tagCount: parseResult.data.tags.length,
      });
      if (result.solution_id) {
        metrics.trackKpi(KPI_EVENTS.SOLUTION_SUBMITTED, req.userId, req.organizationId, {
          issueId: result.issue_id,
          solutionId: result.solution_id,
        });
      }
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('QUOTA_EXCEEDED')) {
        const quotaError = err as Error & {
          quotaInfo?: { limit: number; used: number; resetsAt: Date };
        };
        metrics.trackKpi(KPI_EVENTS.QUOTA_EXCEEDED, req.userId, req.organizationId, {
          contentType: 'issue',
        });
        res.status(429).json({
          error: 'Daily quota exceeded',
          limit: quotaError.quotaInfo?.limit,
          used: quotaError.quotaInfo?.used,
          resetsAt: quotaError.quotaInfo?.resetsAt,
        });
        return;
      }
      if (err instanceof Error && err.message === 'DUPLICATE_ISSUE') {
        const duplicateError = err as DuplicateError;
        metrics.trackKpi(KPI_EVENTS.DUPLICATE_FOUND, req.userId, req.organizationId, {
          hasExactMatch: !!duplicateError.exactMatch,
          similarCount: duplicateError.similarIssues.length,
        });
        res.status(409).json({
          error: 'Duplicate or similar issue found',
          exactMatch: duplicateError.exactMatch,
          similarIssues: duplicateError.similarIssues,
        });
        return;
      }
      logger.logError('Submit failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/issues/:issueId',
  requireAuth,
  requireOrganization,
  requireOwnership(async req => {
    const issueId = parseUuid(req.params.issueId as string, 'issueId');
    const issue = await getIssue(issueId);
    if (issue && issue.organizationId !== req.organizationId) {
      return null;
    }
    return issue?.authorId ?? null;
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const issueId = parseUuid(req.params.issueId as string, 'issueId');
      const issue = await getIssue(issueId);
      if (!issue) {
        res.status(404).json({ error: 'Issue not found' });
        return;
      }
      if (issue.organizationId !== req.organizationId) {
        res.status(403).json({ error: 'Issue does not belong to your organization' });
        return;
      }
      const deleted = await deleteIssue(issueId);
      if (!deleted) {
        res.status(404).json({ error: 'Issue not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.logError('Delete issue failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        issueId: req.params.issueId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/solutions/:solutionId',
  requireAuth,
  requireOrganization,
  requireOwnership(async req => {
    const solutionId = parseUuid(req.params.solutionId as string, 'solutionId');
    const solution = await getSolution(solutionId);
    if (!solution) return null;
    const issue = await getIssue(solution.issueId);
    if (issue && issue.organizationId !== req.organizationId) {
      return null;
    }
    return solution.authorId;
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const solutionId = parseUuid(req.params.solutionId as string, 'solutionId');
      const solution = await getSolution(solutionId);
      if (!solution) {
        res.status(404).json({ error: 'Solution not found' });
        return;
      }
      const issue = await getIssue(solution.issueId);
      if (!issue || issue.organizationId !== req.organizationId) {
        res.status(403).json({ error: 'Solution does not belong to your organization' });
        return;
      }
      const deleted = await deleteSolution(solutionId);
      if (!deleted) {
        res.status(404).json({ error: 'Solution not found' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.logError('Delete solution failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        solutionId: req.params.solutionId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/solutions/:solutionId/accept',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const solutionId = parseUuid(req.params.solutionId as string, 'solutionId');

      if (!req.userId || !req.organizationId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await acceptSolution(solutionId, req.userId, req.organizationId);
      metrics.trackKpi(KPI_EVENTS.SOLUTION_ACCEPTED, req.userId, req.organizationId, {
        solutionId,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
        return;
      }
      logger.logError('Accept solution failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        solutionId: req.params.solutionId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const submitRouter: Router = router;
