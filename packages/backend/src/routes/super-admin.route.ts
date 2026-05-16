import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, organizations, DELETED_ORG_ID } from '@agent-in-sync/db-client';
import { requireAuth, requireSuperAdmin } from '../auth/index.js';
import { logger } from '../observability/index.js';
import { OrganizationService } from '../services/organization.service.js';
import { SuperAdminService } from '../services/super-admin.service.js';
import { DomainService } from '../services/domain.service.js';
import { writeAudit } from '../services/audit.js';

const router = Router();

function getService() {
  return new SuperAdminService({ db: getDb() });
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// --- Dashboard ---

router.get(
  '/dashboard',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await getService().getDashboardStats();
      res.json(data);
    } catch (err) {
      logger.logError('Super admin dashboard failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Users ---

router.get(
  '/users',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const tier =
        req.query.tier === 'free' || req.query.tier === 'paid' ? req.query.tier : undefined;
      const isSuperAdmin =
        req.query.isSuperAdmin === 'true'
          ? true
          : req.query.isSuperAdmin === 'false'
            ? false
            : undefined;

      const data = await getService().getUsers({ ...pagination, search, tier, isSuperAdmin });
      res.json(data);
    } catch (err) {
      logger.logError('Super admin list users failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/users/:userId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await getService().getUserDetail(req.params.userId as string);
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json(user);
    } catch (err) {
      logger.logError('Super admin get user failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        targetUserId: req.params.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const updateUserSchema = z.object({
  isSuperAdmin: z.boolean().optional(),
  tier: z.enum(['free', 'paid']).optional(),
});

router.patch(
  '/users/:userId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    try {
      await getService().updateUser(req.params.userId as string, parseResult.data, req.userId!);
      res.json({ success: true });
    } catch (err) {
      logger.logError('Super admin update user failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        targetUserId: req.params.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Organizations ---

router.get(
  '/organizations',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const isPublic =
        req.query.isPublic === 'true' ? true : req.query.isPublic === 'false' ? false : undefined;

      const data = await getService().getOrganizations({ ...pagination, search, isPublic });
      res.json(data);
    } catch (err) {
      logger.logError('Super admin list organizations failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/organizations/:orgId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const org = await getService().getOrganizationDetail(req.params.orgId as string);
      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }
      res.json(org);
    } catch (err) {
      logger.logError('Super admin get organization failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        orgId: req.params.orgId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const updateOrgSchema = z.object({
  isPublic: z.boolean().optional(),
});

router.patch(
  '/organizations/:orgId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateOrgSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    try {
      await getService().updateOrganization(
        req.params.orgId as string,
        parseResult.data,
        req.userId
      );
      res.json({ success: true });
    } catch (err) {
      logger.logError('Super admin update organization failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        orgId: req.params.orgId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/organizations/:organizationId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const organizationId = req.params.organizationId as string;

    try {
      if (organizationId === DELETED_ORG_ID) {
        res.status(400).json({ error: 'Cannot delete the sentinel organization' });
        return;
      }

      const db = getDb();
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      if (org.isPublic) {
        res.status(400).json({ error: 'Cannot delete the public organization' });
        return;
      }

      const orgService = new OrganizationService({ db });
      await orgService.deleteOrganizationWithContentPreservation(organizationId);

      logger.info('Super admin deleted organization', {
        requestId: req.requestId,
        deletedById: req.userId,
        organizationId,
        organizationName: org.name,
      });

      await writeAudit(db, req.userId!, 'organization.deleted', 'organization', organizationId, {
        name: org.name,
      });

      res.json({ success: true });
    } catch (err) {
      logger.logError('Super admin delete organization failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Content Moderation ---

router.get(
  '/moderation/flags',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const status =
        req.query.status === 'pending' || req.query.status === 'resolved'
          ? req.query.status
          : undefined;
      const contentType =
        req.query.contentType === 'issue' ||
        req.query.contentType === 'solution' ||
        req.query.contentType === 'comment'
          ? req.query.contentType
          : undefined;

      const data = await getService().getFlags({ ...pagination, status, contentType });
      res.json(data);
    } catch (err) {
      logger.logError('Super admin list flags failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const resolveFlagSchema = z.object({
  resolution: z.enum(['dismissed', 'content_hidden', 'author_warned', 'author_suspended']),
});

router.patch(
  '/moderation/flags/:flagId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = resolveFlagSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    try {
      await getService().resolveFlag(
        req.params.flagId as string,
        parseResult.data.resolution,
        req.userId!
      );
      res.json({ success: true });
    } catch (err) {
      logger.logError('Super admin resolve flag failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        flagId: req.params.flagId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Agents ---

router.get(
  '/agents',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const data = await getService().getAgents({ ...pagination, search });
      res.json(data);
    } catch (err) {
      logger.logError('Super admin list agents failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/users/:userId/activity',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const type =
        req.query.type === 'issues' ||
        req.query.type === 'solutions' ||
        req.query.type === 'comments'
          ? req.query.type
          : 'issues';
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const data = await getService().getActivity(
        { userId: req.params.userId as string },
        type,
        pagination.page,
        pagination.limit,
        search
      );
      res.json(data);
    } catch (err) {
      logger.logError('Super admin user activity failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        targetUserId: req.params.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/agents/:agentId/activity',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const type =
        req.query.type === 'issues' ||
        req.query.type === 'solutions' ||
        req.query.type === 'comments'
          ? req.query.type
          : 'issues';
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const data = await getService().getActivity(
        { agentId: req.params.agentId as string },
        type,
        pagination.page,
        pagination.limit,
        search
      );
      res.json(data);
    } catch (err) {
      logger.logError('Super admin agent activity failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        agentId: req.params.agentId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/agents/:agentId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const agent = await getService().getAgentDetail(req.params.agentId as string);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json(agent);
    } catch (err) {
      logger.logError('Super admin get agent failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        agentId: req.params.agentId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Domains ---

router.get(
  '/domains',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const status =
        req.query.status === 'pending' || req.query.status === 'verified'
          ? req.query.status
          : undefined;

      const data = await getService().getDomains({ ...pagination, status });
      res.json(data);
    } catch (err) {
      logger.logError('Super admin list domains failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

const updateDomainSchema = z.object({
  status: z.enum(['pending', 'verified']).optional(),
});

router.patch(
  '/domains/:domainId',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateDomainSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid request', details: parseResult.error.flatten() });
      return;
    }

    try {
      await getService().updateDomain(req.params.domainId as string, parseResult.data, req.userId);
      res.json({ success: true });
    } catch (err) {
      logger.logError('Super admin update domain failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        domainId: req.params.domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/domains/:domainId/verify',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { domainId } = req.params as { domainId: string };

    try {
      const db = getDb();
      const domainService = new DomainService({ db });

      const domain = await domainService.findById(domainId);
      if (!domain) {
        res.status(404).json({ error: 'Domain not found' });
        return;
      }

      await domainService.verifyByAdmin(domainId);

      logger.info('Super admin verified domain', {
        requestId: req.requestId,
        adminUserId: req.userId,
        domainId,
        domainName: domain.name,
      });

      res.json({ domainId, status: 'verified', verificationMethod: 'super_admin' });
    } catch (err) {
      logger.logError('Super admin verify domain failed', err, {
        requestId: req.requestId,
        userId: req.userId,
        domainId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Audit Log ---

router.get(
  '/audit-log',
  requireAuth,
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pagination = paginationSchema.parse(req.query);
      const action = typeof req.query.action === 'string' ? req.query.action : undefined;

      const data = await getService().getAuditLog({ ...pagination, action });
      res.json(data);
    } catch (err) {
      logger.logError('Super admin audit log failed', err, {
        requestId: req.requestId,
        userId: req.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const superAdminRouter: Router = router;
