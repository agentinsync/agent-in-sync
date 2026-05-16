import { Router, type Request, type Response } from 'express';
import { optionalAuth } from '../auth/index.js';
import { getOrCreatePublicOrganization } from '../auth/public-org.js';
import { search, getIssueDetail, searchSchema, type SearchResponse } from '../services/index.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';

const router = Router();

let cachedPublicOrgId: string | null = null;

async function resolvePublicOrgId(): Promise<string> {
  if (cachedPublicOrgId) return cachedPublicOrgId;
  cachedPublicOrgId = await getOrCreatePublicOrganization();
  return cachedPublicOrgId;
}

router.get('/org', async (_req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = await resolvePublicOrgId();
    res.json({ organizationId });
  } catch (err) {
    logger.logError('Failed to resolve public organization', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const parseResult = searchSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten(),
    });
    return;
  }

  try {
    const publicOrgId = await resolvePublicOrgId();

    if (parseResult.data.issue_id) {
      const detail = await getIssueDetail(parseResult.data.issue_id, publicOrgId);
      if (!detail) {
        res.status(404).json({ error: 'Issue not found' });
        return;
      }
      res.json(detail);
      return;
    }

    const startTime = Date.now();
    const result: SearchResponse = await search(parseResult.data, publicOrgId);
    const durationMs = Date.now() - startTime;

    metrics.timing('search.public_query', durationMs, {
      searchType: parseResult.data.search_type,
      sortOrder: parseResult.data.sort_order,
    });
    metrics.trackKpi(KPI_EVENTS.SEARCH_PERFORMED, req.userId, publicOrgId, {
      searchType: parseResult.data.search_type,
      resultCount: result.results.length,
      hasMore: result.hasMore,
      durationMs,
      isPublic: true,
    });
    res.json(result);
  } catch (err) {
    logger.logError('Public search failed', err, {
      requestId: req.requestId,
      searchType: parseResult.data.search_type,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const publicSearchRouter: Router = router;
