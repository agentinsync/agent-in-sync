import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireOrganization } from '../auth/index.js';
import { getDb, users, organizationMembers, organizations } from '@agent-in-sync/db-client';
import { eq, and } from 'drizzle-orm';
import { OrganizationService } from '../services/organization.service.js';
import { DomainService } from '../services/domain.service.js';
import { StatsService } from '../services/stats.service.js';
import { logger } from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';
import { checkSuperAdmin } from '../auth/super-admin.js';

const router = Router();

function getOrganizationService() {
  return new OrganizationService({ db: getDb() });
}

function getDomainService() {
  return new DomainService({ db: getDb() });
}

const createOrganizationSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parseResult = createOrganizationSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.flatten(),
    });
    return;
  }

  try {
    const db = getDb();
    const [user] = await db
      .select({ domainId: users.domainId })
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);

    const organizationService = getOrganizationService();
    const org = await organizationService.createOrganization(
      parseResult.data,
      req.userId!,
      user?.domainId
    );

    res.status(201).json(org);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ error: 'Organization with this slug already exists' });
      return;
    }
    logger.logError('Create organization failed', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/available', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [user] = await db
      .select({ domainId: users.domainId })
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);

    if (!user?.domainId) {
      res.json({ organizations: [], message: 'No domain associated with your account' });
      return;
    }

    const organizationService = getOrganizationService();
    const availableOrgs = await organizationService.getAvailableOrganizations(
      req.userId!,
      user.domainId
    );

    res.json({ organizations: availableOrgs });
  } catch (err) {
    logger.logError('Get available organizations failed', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:orgId/join', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params.orgId as string;

  try {
    const db = getDb();
    const [user] = await db
      .select({ domainId: users.domainId })
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);

    const organizationService = getOrganizationService();
    const org = await organizationService.getOrganization(orgId);

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (org.domainId && org.domainId !== user?.domainId) {
      res.status(403).json({ error: 'You can only join organizations in your domain' });
      return;
    }

    if (!org.domainId && !user?.domainId) {
      res.status(403).json({ error: 'Cannot join personal organizations without an invite' });
      return;
    }

    const membership = await organizationService.joinOrganization(orgId, req.userId!);

    res.status(201).json(membership);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    logger.logError('Join organization failed', err, {
      requestId: req.requestId,
      userId: req.userId,
      orgId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/my', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const isSuperAdmin = req.user?.email ? await checkSuperAdmin(req.user.email) : false;
    const organizationService = getOrganizationService();
    const orgs = await organizationService.getUserOrganizations(req.userId!, isSuperAdmin);

    res.json({ organizations: orgs });
  } catch (err) {
    logger.logError('Get user organizations failed', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/domain-info', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    const [user] = await db
      .select({ domainId: users.domainId })
      .from(users)
      .where(eq(users.id, req.userId!))
      .limit(1);

    if (!user?.domainId) {
      res.json({ hasDomain: false, domain: null });
      return;
    }

    const domainService = getDomainService();
    const domain = await domainService.findById(user.domainId);

    if (!domain) {
      res.json({ hasDomain: false, domain: null });
      return;
    }

    const organizationService = getOrganizationService();
    const canCreate = await organizationService.canCreateOrganizationForDomain(domain.id);

    res.json({
      hasDomain: true,
      domain: {
        id: domain.id,
        name: domain.name,
        status: domain.status,
        isAdmin: domain.domainAdminId === req.userId,
        memberCount: domain.memberCount,
        organizationCount: domain.organizationCount,
        canCreateOrganization: canCreate,
        maxOrganizations: 5,
      },
    });
  } catch (err) {
    logger.logError('Get domain info failed', err, {
      requestId: req.requestId,
      userId: req.userId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/slug/:slug', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const slug = req.params.slug as string;
  try {
    const organizationService = getOrganizationService();
    const org = await organizationService.getOrganizationBySlug(slug, req.userId!);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    res.json(org);
  } catch (err) {
    logger.logError('Get org by slug failed', err, {
      requestId: req.requestId,
      userId: req.userId,
      slug,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get(
  '/:orgId/stats',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.params.orgId as string;

    if (orgId !== req.organizationId) {
      res.status(403).json({ error: 'You can only view stats for your current organization' });
      return;
    }

    try {
      const statsService = new StatsService({ db: getDb() });
      const stats = await statsService.getOrganizationStats(orgId);

      res.json(stats);
    } catch (err) {
      logger.logError('Get organization stats failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        orgId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:orgId/leaderboard',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.params.orgId as string;
    const limitParam = req.query.limit;
    const limit =
      typeof limitParam === 'string' ? Math.min(50, Math.max(1, parseInt(limitParam))) : 10;

    if (orgId !== req.organizationId) {
      res
        .status(403)
        .json({ error: 'You can only view leaderboard for your current organization' });
      return;
    }

    try {
      const statsService = new StatsService({ db: getDb() });
      const leaderboard = await statsService.getLeaderboard(orgId, limit);

      res.json({ leaderboard });
    } catch (err) {
      logger.logError('Get organization leaderboard failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        orgId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get('/:orgId/members', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const orgId = req.params.orgId as string;
  const limitParam = req.query['limit'];
  const offsetParam = req.query['offset'];
  const limit =
    typeof limitParam === 'string' ? Math.min(50, Math.max(1, parseInt(limitParam) || 20)) : 20;
  const offset = typeof offsetParam === 'string' ? Math.max(0, parseInt(offsetParam) || 0) : 0;

  try {
    const db = getDb();
    const [[callerMembership], [org]] = await Promise.all([
      db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, req.userId!)
          )
        )
        .limit(1),
      db
        .select({ isPublic: organizations.isPublic })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1),
    ]);

    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    if (org.isPublic) {
      const superAdmin = req.user?.email ? await checkSuperAdmin(req.user.email) : false;
      if (!superAdmin) {
        res.status(403).json({ error: 'Member list is not available for public organizations' });
        return;
      }
    } else if (!callerMembership) {
      res.status(403).json({ error: 'You are not a member of this organization' });
      return;
    }

    const organizationService = getOrganizationService();
    const result = await organizationService.getOrganizationMembersWithAgentsPaged(
      orgId,
      limit,
      offset
    );

    res.json({ ...result, callerRole: callerMembership?.role ?? null });
  } catch (err) {
    logger.logError('Get org members failed', err, {
      requestId: req.requestId,
      userId: req.userId,
      orgId,
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete(
  '/:orgId/members/:targetUserId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.params.orgId as string;
    const targetUserId = req.params.targetUserId as string;

    try {
      const db = getDb();
      const [callerMembership] = await db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, req.userId!)
          )
        )
        .limit(1);

      if (!callerMembership || callerMembership.role !== 'admin') {
        res.status(403).json({ error: 'Only org admins can remove members' });
        return;
      }

      if (targetUserId === req.userId) {
        res.status(400).json({ error: 'Admins cannot remove themselves' });
        return;
      }

      const [targetMembership] = await db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, targetUserId)
          )
        )
        .limit(1);

      if (!targetMembership) {
        res.status(404).json({ error: 'Member not found' });
        return;
      }

      if (targetMembership.role === 'admin') {
        res.status(403).json({ error: 'Cannot remove an admin from the organization' });
        return;
      }

      const organizationService = getOrganizationService();
      await organizationService.removeMember(orgId, targetUserId);

      res.json({ success: true });
    } catch (err) {
      logger.logError('Remove org member failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        orgId,
        targetUserId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:orgId/agents/:agentId/revoke-key',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.params.orgId as string;
    const agentId = req.params.agentId as string;

    try {
      const db = getDb();
      const [callerMembership] = await db
        .select({ role: organizationMembers.role })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, orgId),
            eq(organizationMembers.userId, req.userId!)
          )
        )
        .limit(1);

      if (!callerMembership || callerMembership.role !== 'admin') {
        res.status(403).json({ error: 'Only org admins can revoke agent API keys' });
        return;
      }

      const organizationService = getOrganizationService();
      await organizationService.revokeAgentApiKeyInOrg(agentId, orgId);

      res.json({ success: true });
    } catch (err) {
      logger.logError('Revoke agent API key failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        orgId,
        agentId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const organizationRouter: Router = router;
