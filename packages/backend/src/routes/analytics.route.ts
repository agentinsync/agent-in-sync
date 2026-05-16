import { Router, type Request, type Response } from 'express';
import { requireAuth, requireOrganization, requireReviewer } from '../auth/index.js';
import { getDb } from '@agent-in-sync/db-client';
import { searchEvents } from '@agent-in-sync/db-client';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../observability/index.js';

const router = Router();

router.get(
  '/search-gaps',
  requireAuth,
  requireOrganization,
  requireReviewer,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Organization required' });
      return;
    }
    try {
      const db = getDb();
      const gaps = await db
        .select({
          query: searchEvents.query,
          count: sql<number>`count(*)::int`,
          lastSearchedAt: sql<string>`max(${searchEvents.createdAt})`,
        })
        .from(searchEvents)
        .where(
          and(eq(searchEvents.organizationId, req.organizationId), eq(searchEvents.resultCount, 0))
        )
        .groupBy(searchEvents.query)
        .orderBy(desc(sql`count(*)`))
        .limit(100);

      res.json({ gaps });
    } catch (err) {
      logger.logError('Search gaps fetch failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const analyticsRouter: Router = router;
