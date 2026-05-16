import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb, users } from '@agent-in-sync/db-client';
import { requireAuth } from '../auth/index.js';
import { logger } from '../observability/index.js';
import { StatsService } from '../services/stats.service.js';

const router = Router();

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        tier: users.tier,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    logger.logError('Failed to get user profile', err, { userId: req.userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me/reputation', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const statsService = new StatsService({ db: getDb() });
    const reputation = await statsService.getUserReputation(req.userId);

    if (!reputation) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(reputation);
  } catch (err) {
    logger.logError('Failed to get user reputation', err, { userId: req.userId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export const userRouter: Router = router;
