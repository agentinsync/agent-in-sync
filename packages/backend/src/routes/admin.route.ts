import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireOrganization, requireAdmin } from '../auth/index.js';
import {
  getOrganization,
  getOrganizationMembers,
  addMember,
  updateMemberRole,
  removeMember,
  getOrgSettings,
  updateOrgSettings,
  type MembershipRole,
} from '../services/index.js';
import { organizationSettingsSchema } from '@agent-in-sync/shared';
import { logger } from '../observability/index.js';

const router = Router();

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['member', 'admin', 'reviewer']).default('member'),
});

const updateRoleSchema = z.object({
  role: z.enum(['member', 'admin', 'reviewer']),
});

router.get(
  '/organizations/:orgId',
  requireAuth,
  requireOrganization,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const org = await getOrganization(req.organizationId!);
      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }
      res.json(org);
    } catch (err) {
      logger.logError('Get organization failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/organizations/:orgId/members',
  requireAuth,
  requireOrganization,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const members = await getOrganizationMembers(req.organizationId!);
      res.json({ members });
    } catch (err) {
      logger.logError('List organization members failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/organizations/:orgId/members',
  requireAuth,
  requireOrganization,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = addMemberSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const member = await addMember(req.organizationId!, parseResult.data);
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof Error && err.message.includes('unique')) {
        res.status(409).json({ error: 'User is already a member of this organization' });
        return;
      }
      logger.logError('Add organization member failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
        targetUserId: parseResult.data.userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/organizations/:orgId/members/:userId',
  requireAuth,
  requireOrganization,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateRoleSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { userId } = req.params;

    const targetUserId = userId as string;

    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    try {
      await updateMemberRole(
        req.organizationId!,
        targetUserId,
        parseResult.data.role as MembershipRole
      );
      res.json({ success: true });
    } catch (err) {
      logger.logError('Update member role failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
        targetUserId: userId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/organizations/:orgId/members/:userId',
  requireAuth,
  requireOrganization,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const targetUserId = req.params.userId as string;

    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'Cannot remove yourself from the organization' });
      return;
    }

    try {
      await removeMember(req.organizationId!, targetUserId);
      res.json({ success: true });
    } catch (err) {
      logger.logError('Remove organization member failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
        targetUserId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/organizations/:orgId/settings',
  requireAuth,
  requireOrganization,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const settings = await getOrgSettings(req.organizationId!);
      res.json(settings);
    } catch (err) {
      logger.logError('Get organization settings failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.put(
  '/organizations/:orgId/settings',
  requireAuth,
  requireOrganization,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = organizationSettingsSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.flatten(),
      });
      return;
    }

    try {
      const settings = await updateOrgSettings(req.organizationId!, parseResult.data);
      res.json(settings);
    } catch (err) {
      logger.logError('Update organization settings failed', err, {
        requestId: req.requestId,
        organizationId: req.organizationId,
      });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

export const adminRouter: Router = router;
