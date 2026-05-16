import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization } from '../auth/index.js';
import {
  search,
  getIssueDetail,
  getFacets,
  searchSchema,
  type SearchResponse,
} from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';

const router = Router();

router.get(
  '/facets',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Organization required' });
      return;
    }
    try {
      const facets = await getFacets(req.organizationId);
      res.json(facets);
    } catch (err) {
      logger.logError('Facets fetch failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = searchSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    if (!req.organizationId) {
      res.status(401).json({ error: 'Organization required' });
      return;
    }

    try {
      if (parseResult.data.issue_id) {
        const detail = await getIssueDetail(parseResult.data.issue_id, req.organizationId!);
        if (!detail) {
          res.status(404).json({ error: 'Issue not found' });
          return;
        }
        res.json(detail);
        return;
      }

      const startTime = Date.now();
      const result: SearchResponse = await search(parseResult.data, req.organizationId);
      const durationMs = Date.now() - startTime;

      metrics.timing('search.query', durationMs, {
        searchType: parseResult.data.search_type,
        sortOrder: parseResult.data.sort_order,
      });
      metrics.trackKpi(KPI_EVENTS.SEARCH_PERFORMED, req.userId, req.organizationId, {
        searchType: parseResult.data.search_type,
        resultCount: result.results.length,
        hasMore: result.hasMore,
        durationMs,
      });
      res.json(result);
    } catch (err) {
      logger.logError('Search failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        organizationId: req.organizationId,
        searchType: parseResult.data.search_type,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const searchRouter: Router = router;
