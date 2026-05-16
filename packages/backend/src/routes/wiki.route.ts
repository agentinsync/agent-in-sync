import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, requireOrganization } from '../auth/index.js';
import {
  WikiService,
  DuplicateSourceError,
  VersionConflictError,
} from '../services/wiki.service.js';
import { createServiceDependencies } from '../services/index.js';
import {
  ingestSourceInputSchema,
  upsertWikiPageInputSchema,
  wikiSearchInputSchema,
} from '@agent-in-sync/shared';
import { logger } from '../observability/index.js';
import { z } from 'zod';

const router = Router();

// POST /api/v1/wiki/sources — Ingest a raw source
router.post(
  '/sources',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = ingestSourceInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);

      const result = await wiki.ingestSource(parseResult.data, {
        userId: req.userId,
        organizationId: req.organizationId,
        agentId: req.agentId,
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof DuplicateSourceError) {
        res.status(409).json({ error: 'Duplicate source', existingSourceId: err.existingSourceId });
        return;
      }
      logger.logError('Wiki source ingest failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/v1/wiki/pages — Create a new wiki page (backend generates the slug)
const createWikiPageBodySchema = upsertWikiPageInputSchema.omit({ slug: true, version: true });

router.post(
  '/pages',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = createWikiPageBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);

      const slug = randomUUID();
      const result = await wiki.upsertPage(
        { ...parseResult.data, slug },
        { userId: req.userId, organizationId: req.organizationId, agentId: req.agentId }
      );

      res.status(201).json({ ...result, slug });
    } catch (err) {
      logger.logError('Wiki page create failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// PUT /api/v1/wiki/pages/:slug — Create or update a wiki page
router.put(
  '/pages/:slug',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = upsertWikiPageInputSchema.safeParse({
      ...req.body,
      slug: req.params.slug,
    });
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);

      const result = await wiki.upsertPage(parseResult.data, {
        userId: req.userId,
        organizationId: req.organizationId,
        agentId: req.agentId,
      });

      res.status(result.status === 'created' ? 201 : 200).json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'VERSION_REQUIRED') {
        res.status(400).json({ error: 'version is required when updating an existing page' });
        return;
      }
      if (err instanceof VersionConflictError) {
        res.status(409).json({
          error: 'Version conflict — page was updated by another agent',
          currentVersion: err.currentVersion,
        });
        return;
      }
      logger.logError('Wiki page upsert failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/pages/:slug — Get full wiki page
router.get(
  '/pages/:slug',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);

      const page = await wiki.getPage(req.organizationId, String(req.params.slug));
      if (!page) {
        res.status(404).json({ error: 'Wiki page not found' });
        return;
      }

      res.json(page);
    } catch (err) {
      logger.logError('Wiki page get failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/pages — List wiki pages (paginated, filterable by project)
const listPagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  project: z.string().max(200).optional(),
});

router.get(
  '/pages',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const parseResult = listPagesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res
        .status(400)
        .json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);

      const result = await wiki.listPages(req.organizationId, parseResult.data);
      res.json(result);
    } catch (err) {
      logger.logError('Wiki pages list failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/v1/wiki/search — Semantic/hybrid search over wiki pages
router.post(
  '/search',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = wikiSearchInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);

      const result = await wiki.search(parseResult.data, {
        userId: req.userId,
        organizationId: req.organizationId,
        agentId: req.agentId,
      });
      res.json(result);
    } catch (err) {
      logger.logError('Wiki search failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  project: z.string().max(200).optional(),
});

// GET /api/v1/wiki/sources/:id — Get a single source including full content
router.get(
  '/sources/:id',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const parseResult = z.string().uuid().safeParse(req.params.id);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid source ID' });
      return;
    }
    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      const source = await wiki.getSource(req.organizationId, parseResult.data);
      if (!source) {
        res.status(404).json({ error: 'Source not found' });
        return;
      }
      res.json(source);
    } catch (err) {
      logger.logError('Wiki source get failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/sources — List raw sources
router.get(
  '/sources',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const parseResult = listQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res
        .status(400)
        .json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }
    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      res.json(await wiki.listSources(req.organizationId, parseResult.data));
    } catch (err) {
      logger.logError('Wiki sources list failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/log — Activity log
router.get(
  '/log',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const parseResult = listQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res
        .status(400)
        .json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }
    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      res.json(await wiki.listLog(req.organizationId, parseResult.data));
    } catch (err) {
      logger.logError('Wiki log list failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/history — Global edit history across all pages
router.get(
  '/history',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const parseResult = listQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res
        .status(400)
        .json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
      return;
    }
    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      res.json(await wiki.listHistory(req.organizationId, parseResult.data));
    } catch (err) {
      logger.logError('Wiki history list failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/pages/:slug/versions — Full version history with bodies
router.get(
  '/pages/:slug/versions',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      const result = await wiki.listPageVersions(req.organizationId, String(req.params.slug));
      if (!result) {
        res.status(404).json({ error: 'Wiki page not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      logger.logError('Wiki page versions failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/v1/wiki/pages/:slug/vote — Cast or toggle a vote on a wiki page
router.post(
  '/pages/:slug/vote',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.userId || !req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const parseResult = z.object({ direction: z.enum(['up', 'down']) }).safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'direction must be "up" or "down"' });
      return;
    }

    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      const result = await wiki.voteOnPage(String(req.params.slug), parseResult.data.direction, {
        userId: req.userId,
        organizationId: req.organizationId,
        agentId: req.agentId,
        apiKeyId: req.apiKeyId,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === 'PAGE_NOT_FOUND') {
        res.status(404).json({ error: 'Wiki page not found' });
        return;
      }
      logger.logError('Wiki page vote failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/v1/wiki/graph — Page nodes + edges for graph view
router.get(
  '/graph',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.organizationId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    try {
      const deps = await createServiceDependencies();
      const wiki = new WikiService(deps);
      res.json(await wiki.listGraph(req.organizationId));
    } catch (err) {
      logger.logError('Wiki graph failed', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const wikiRouter: Router = router;
