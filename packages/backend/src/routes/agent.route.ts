import { Router, type Request, type Response } from 'express';
import { getDb } from '@agent-in-sync/db-client';
import { createAgentSchema, updateAgentSchema } from '@agent-in-sync/shared';
import { requireAuth, optionalAuth } from '../auth/index.js';
import { AgentService } from '../services/agent.service.js';
import { asyncHandler } from '../middleware/async-handler.js';

const router = Router();

function getService() {
  return new AgentService({ db: getDb() });
}

function getOrganizationId(req: Request): string | undefined {
  return req.organizationId || (req.headers['x-organization-id'] as string) || undefined;
}

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parseResult = createAgentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    const organizationId = getOrganizationId(req);
    if (!organizationId) {
      res.status(400).json({ error: 'Organization ID required (X-Organization-Id header)' });
      return;
    }

    const service = getService();
    const agent = await service.createAgent(
      parseResult.data,
      req.userId!,
      organizationId,
      req.apiKeyId
    );

    res.status(201).json(agent);
  })
);

router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const search = (req.query.search as string) || undefined;

    const service = getService();
    const result = await service.listAgents(req.userId, getOrganizationId(req), {
      limit,
      offset,
      search,
    });

    res.json(result);
  })
);

router.get(
  '/:slug',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const service = getService();
    const agent = await service.getAgentBySlug(
      req.params['slug'] as string,
      req.userId,
      getOrganizationId(req)
    );

    res.json(agent);
  })
);

router.patch(
  '/:slug',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateAgentSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    const service = getService();
    const agent = await service.updateAgent(
      req.params['slug'] as string,
      parseResult.data,
      req.userId!,
      req.agentId
    );

    res.json(agent);
  })
);

router.delete(
  '/:slug',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const service = getService();
    await service.deleteAgent(req.params['slug'] as string, req.userId!);

    res.status(204).send();
  })
);

router.post(
  '/:slug/connect',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const service = getService();
    const agent = await service.connectHuman(req.params['slug'] as string, req.userId!);

    res.json(agent);
  })
);

router.post(
  '/:slug/link-key',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { apiKeyId } = req.body;
    if (!apiKeyId || typeof apiKeyId !== 'string') {
      res.status(400).json({ error: 'apiKeyId is required' });
      return;
    }

    const service = getService();
    await service.linkApiKey(req.params['slug'] as string, apiKeyId, req.userId!);

    res.json({ success: true });
  })
);

router.post(
  '/:slug/create-key',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const service = getService();
    const result = await service.createKeyForAgent(req.params['slug'] as string, req.userId!);
    res.status(201).json(result);
  })
);

router.post(
  '/:slug/regenerate-key',
  requireAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const service = getService();
    const result = await service.regenerateKey(req.params['slug'] as string, req.userId!);
    res.status(201).json(result);
  })
);

router.get(
  '/:slug/issues',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const service = getService();
    const result = await service.getAgentIssues(
      req.params['slug'] as string,
      req.userId,
      getOrganizationId(req),
      { limit, offset, isSuperAdmin: req.isSuperAdmin }
    );

    res.json(result);
  })
);

router.get(
  '/:slug/wiki-pages',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const service = getService();
    const result = await service.getAgentWikiPages(
      req.params['slug'] as string,
      req.userId,
      getOrganizationId(req),
      { limit, offset, isSuperAdmin: req.isSuperAdmin }
    );

    res.json(result);
  })
);

router.get(
  '/:slug/activity',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const service = getService();
    const result = await service.getAgentActivity(
      req.params['slug'] as string,
      req.userId,
      getOrganizationId(req),
      { limit, offset, isSuperAdmin: req.isSuperAdmin }
    );

    res.json(result);
  })
);

export const agentRouter: Router = router;
