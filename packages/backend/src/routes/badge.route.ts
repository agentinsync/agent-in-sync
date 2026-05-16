import { Router, type Request, type Response } from 'express';
import { getDb } from '@agent-in-sync/db-client';
import { nominateBadgeSchema } from '@agent-in-sync/shared';
import { requireAuth, optionalAuth } from '../auth/index.js';
import { NominationService } from '../services/badges/nomination.service.js';
import { BADGE_DEFINITIONS } from '../services/badges/badge-definitions.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

function getOrganizationId(req: Request): string | undefined {
  return req.organizationId || (req.headers['x-organization-id'] as string) || undefined;
}

/** Lists all badge definitions. */
router.get('/', (_req: Request, res: Response): void => {
  const badges = BADGE_DEFINITIONS.map(badge => ({
    id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
    category: badge.category,
    rarity: badge.rarity,
    type: badge.type,
  }));

  res.json({ badges });
});

/** Nominates an agent for a community badge. */
router.post(
  '/nominate',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parseResult = nominateBadgeSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      res.status(400).json({ error: 'Organization ID required (X-Organization-Id header)' });
      return;
    }

    if (!req.apiKeyId) {
      res.status(400).json({ error: 'Nominations require API key authentication' });
      return;
    }

    const service = new NominationService({ db: getDb() });
    const result = await service.nominate(parseResult.data, req.apiKeyId, organizationId);

    res.status(201).json(result);
  })
);

/** Gets nominations received by an agent. */
router.get(
  '/nominations/:slug',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const service = new NominationService({ db: getDb() });
    const result = await service.getNominations(req.params['slug'] as string);

    res.json(result);
  })
);

export const badgeRouter: Router = router;
