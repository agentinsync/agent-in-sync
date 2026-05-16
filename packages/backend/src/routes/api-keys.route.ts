import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb, organizationMembers } from '@agent-in-sync/db-client';
import { requireAuth } from '../auth/index.js';
import { createApiKey, listApiKeys, revokeApiKey, regenerateApiKey } from '../auth/api-keys.js';
import { logger, metrics, KPI_EVENTS } from '../observability/index.js';
import { StatsService } from '../services/stats.service.js';
import { writeAudit } from '../services/audit.js';

const router = Router();

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  organizationId: z.string().uuid(),
});

const listKeysQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const queryResult = listKeysQuerySchema.safeParse(req.query);
  const organizationId = queryResult.success ? queryResult.data.organizationId : undefined;

  try {
    const keys = await listApiKeys(req.userId, organizationId);
    res.json({ keys });
  } catch (err) {
    logger.logError('List API keys failed', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parseResult = createKeySchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten(),
    });
    return;
  }

  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { name, organizationId } = parseResult.data;

  try {
    const db = getDb();
    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, req.userId)
        )
      )
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this organization' });
      return;
    }

    const result = await createApiKey(req.userId, organizationId, name);
    metrics.trackKpi(KPI_EVENTS.API_KEY_CREATED, req.userId, organizationId, {
      keyId: result.id,
      keyName: name,
    });
    writeAudit(getDb(), req.userId, 'api_key.created', 'api_key', result.id, {
      keyName: name,
      organizationId,
    });
    res.status(201).json({
      id: result.id,
      key: result.key,
      prefix: result.prefix,
      organizationId: result.organizationId,
      message: 'Store this key securely - it will not be shown again',
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Organization not found') {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    if (err instanceof Error && err.message === 'API_KEY_ALREADY_EXISTS') {
      res.status(409).json({
        error:
          'An API key already exists for this organization. Regenerate it from the API keys page.',
      });
      return;
    }
    logger.logError('Create API key failed', err, {
      requestId: req.requestId,
      userId: req.userId,
      organizationId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:keyId/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { keyId } = req.params;

  try {
    const statsService = new StatsService({ db: getDb() });
    const stats = await statsService.getApiKeyStats(keyId as string, req.userId);

    if (!stats) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json(stats);
  } catch (err) {
    logger.logError('Get API key stats failed', err, {
      requestId: req.requestId,
      userId: req.userId,
      keyId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:keyId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (!req.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const { keyId } = req.params;

  try {
    const deleted = await revokeApiKey(req.userId, keyId as string);
    if (!deleted) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }
    writeAudit(getDb(), req.userId, 'api_key.revoked', 'api_key', keyId as string, {});
    res.json({ success: true });
  } catch (err) {
    logger.logError('Revoke API key failed', err, {
      requestId: req.requestId,
      userId: req.userId,
      keyId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/:keyId/regenerate',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { keyId } = req.params;

    try {
      const result = await regenerateApiKey(req.userId, keyId as string);
      writeAudit(getDb(), req.userId, 'api_key.regenerated', 'api_key', result.id, {});
      res.json({
        id: result.id,
        key: result.key,
        prefix: result.prefix,
        organizationId: result.organizationId,
        message: 'Store this key securely - it will not be shown again',
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'API key not found') {
        res.status(404).json({ error: 'API key not found' });
        return;
      }
      logger.logError('Regenerate API key failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        keyId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const apiKeysRouter: Router = router;
