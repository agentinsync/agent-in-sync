import { randomBytes } from 'crypto';
import { z } from 'zod';
import { eq, and, count, inArray, asc, sql } from 'drizzle-orm';
import {
  organizations,
  organizationMembers,
  users,
  issues,
  agents,
  badgeNominations,
  sharedContent,
  DELETED_ORG_ID,
  apiKeys,
} from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import {
  logger,
  trackSuccess,
  trackError,
  OPERATIONS,
  KPI_EVENTS,
  metrics,
} from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';
import {
  organizationSettingsSchema,
  resolveOrgSettings,
  type OrganizationSettings,
} from '@agent-in-sync/shared';
import { isFreePeriodActive } from '../constants.js';

export type MembershipRole = 'member' | 'admin' | 'reviewer';

const MAX_ORGS_PER_DOMAIN = 5;

export const createOrganizationSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['member', 'admin', 'reviewer']).default('member'),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export type OrganizationResponse = {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  domainId: string | null;
  createdAt: string;
};

export type AvailableOrganization = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
};

export type MemberResponse = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  role: MembershipRole;
  createdAt: string;
};

export type AgentSummary = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  isPublic: boolean;
  apiKeyId: string | null;
};

export type MemberWithAgents = MemberResponse & {
  userImage: string | null;
  agents: AgentSummary[];
};

export class OrganizationService {
  constructor(private deps: ServiceDependencies) {}

  async getUserTier(userId: string): Promise<'free' | 'paid'> {
    const { db } = this.deps;
    const [user] = await db
      .select({ tier: users.tier })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.tier ?? 'free';
  }

  async createOrganization(
    input: CreateOrganizationInput,
    ownerId: string,
    domainId?: string | null
  ): Promise<OrganizationResponse> {
    const startTime = Date.now();
    const { db } = this.deps;
    const { name, slug } = input;

    try {
      const userTier = await this.getUserTier(ownerId);
      if (userTier === 'free' && !isFreePeriodActive()) {
        throw new ForbiddenError(
          'UPGRADE_REQUIRED',
          'Private organizations require a paid plan. Upgrade to create private organizations.'
        );
      }

      if (domainId) {
        const canCreate = await this.canCreateOrganizationForDomain(domainId);
        if (!canCreate) {
          throw new ForbiddenError(
            `Maximum of ${MAX_ORGS_PER_DOMAIN} organizations per domain reached`
          );
        }
      }

      const org = await db.transaction(async tx => {
        const [txOrg] = await tx
          .insert(organizations)
          .values({ name, slug, isPublic: false, domainId: domainId ?? null })
          .returning();

        if (!txOrg) {
          logger.error('Organization creation failed: database insert returned empty', {
            name,
            slug,
            ownerId,
          });
          trackError(OPERATIONS.ORGANIZATION_CREATE, 'DB_INSERT_FAILED');
          throw new Error('Failed to create organization');
        }

        await tx.insert(organizationMembers).values({
          organizationId: txOrg.id,
          userId: ownerId,
          role: 'admin',
        });

        return txOrg;
      });

      const durationMs = Date.now() - startTime;
      logger.info('Organization created successfully', {
        organizationId: org.id,
        name,
        slug,
        ownerId,
        domainId,
        durationMs,
      });
      trackSuccess(OPERATIONS.ORGANIZATION_CREATE, durationMs);
      metrics.trackKpi(KPI_EVENTS.ORGANIZATION_CREATED, ownerId, org.id, { domainId });

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        isPublic: org.isPublic,
        domainId: org.domainId,
        createdAt: org.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw err;
      }
      if (err instanceof Error && err.message !== 'Failed to create organization') {
        logger.logError('Unexpected error creating organization', err, { name, slug, ownerId });
        trackError(OPERATIONS.ORGANIZATION_CREATE, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async canCreateOrganizationForDomain(domainId: string): Promise<boolean> {
    const { db } = this.deps;

    const [result] = await db
      .select({ count: count() })
      .from(organizations)
      .where(eq(organizations.domainId, domainId));

    return (result?.count ?? 0) < MAX_ORGS_PER_DOMAIN;
  }

  async getDefaultOrgForDomain(domainId: string): Promise<{ id: string; name: string } | null> {
    const { db } = this.deps;

    const [org] = await db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(and(eq(organizations.domainId, domainId), eq(organizations.isDefault, true)))
      .limit(1);

    return org ?? null;
  }

  async createDefaultOrg(domainLabel: string, domainId: string, ownerId: string): Promise<string> {
    const { db } = this.deps;
    const name = domainLabel.charAt(0).toUpperCase() + domainLabel.slice(1);
    const slug = await generateUniqueSlug(db, domainLabel);

    const org = await db.transaction(async tx => {
      const [txOrg] = await tx
        .insert(organizations)
        .values({ name, slug, isPublic: false, isDefault: true, domainId })
        .returning();

      if (!txOrg) throw new Error('Failed to create default organization');

      await tx
        .insert(organizationMembers)
        .values({ organizationId: txOrg.id, userId: ownerId, role: 'admin' });

      return txOrg;
    });

    logger.info('Default organization created', { orgId: org.id, name, domainId, ownerId });
    metrics.trackKpi(KPI_EVENTS.ORGANIZATION_CREATED, ownerId, org.id, {
      domainId,
      isDefault: true,
    });

    return org.id;
  }

  async joinDefaultOrg(domainId: string, userId: string): Promise<void> {
    const defaultOrg = await this.getDefaultOrgForDomain(domainId);
    if (!defaultOrg) return;

    const { db } = this.deps;

    const [existing] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, defaultOrg.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (existing) return;

    await db
      .insert(organizationMembers)
      .values({ organizationId: defaultOrg.id, userId, role: 'member' });

    logger.info('User auto-joined default org', { orgId: defaultOrg.id, userId });
    metrics.trackKpi(KPI_EVENTS.ORGANIZATION_JOINED, userId, defaultOrg.id);
  }

  async getOrganization(organizationId: string): Promise<OrganizationResponse | null> {
    const { db } = this.deps;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) return null;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isPublic: org.isPublic,
      domainId: org.domainId,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async getPublicOrganization(): Promise<OrganizationResponse | null> {
    const { db } = this.deps;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.isPublic, true))
      .limit(1);

    if (!org) return null;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isPublic: org.isPublic,
      domainId: org.domainId,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async ensurePublicOrganization(): Promise<OrganizationResponse> {
    const existing = await this.getPublicOrganization();
    if (existing) return existing;

    const { db } = this.deps;
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Public', slug: 'public', isPublic: true })
      .returning();

    if (!org) {
      throw new Error('Failed to create public organization');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isPublic: org.isPublic,
      domainId: org.domainId,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async ensureUserInPublicOrg(userId: string): Promise<void> {
    const publicOrg = await this.ensurePublicOrganization();
    const { db } = this.deps;

    const [existingMembership] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, publicOrg.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);

    if (existingMembership) return;

    await db.insert(organizationMembers).values({
      organizationId: publicOrg.id,
      userId,
      role: 'member',
    });

    logger.info('User added to public organization', { userId, organizationId: publicOrg.id });
  }

  async getUserOrganizations(
    userId: string,
    isSuperAdmin = false
  ): Promise<Array<OrganizationResponse & { role: MembershipRole; memberCount: number }>> {
    const { db } = this.deps;

    const memberships = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        isPublic: organizations.isPublic,
        domainId: organizations.domainId,
        createdAt: organizations.createdAt,
        role: organizationMembers.role,
        memberCount: sql<number>`(select count(*)::int from ${organizationMembers} om2 where om2.organization_id = ${organizations.id})`,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId));

    return memberships.map(m => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      isPublic: m.isPublic,
      domainId: m.domainId,
      createdAt: m.createdAt.toISOString(),
      role: m.role,
      memberCount: m.isPublic && !isSuperAdmin ? 0 : m.memberCount,
    }));
  }

  async getOrganizationsForDomain(domainId: string): Promise<AvailableOrganization[]> {
    const { db } = this.deps;

    const orgs = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
      })
      .from(organizations)
      .where(eq(organizations.domainId, domainId));

    const results = await Promise.all(
      orgs.map(async org => {
        const [memberCountResult] = await db
          .select({ count: count() })
          .from(organizationMembers)
          .where(eq(organizationMembers.organizationId, org.id));
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          memberCount: memberCountResult?.count ?? 0,
        };
      })
    );

    return results;
  }

  async getAvailableOrganizations(
    userId: string,
    domainId: string | null
  ): Promise<AvailableOrganization[]> {
    if (!domainId) return [];

    const { db } = this.deps;

    const userMemberships = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    const userOrgIds = new Set(userMemberships.map(m => m.organizationId));

    const domainOrgs = await this.getOrganizationsForDomain(domainId);

    return domainOrgs.filter(org => !userOrgIds.has(org.id));
  }

  async joinOrganization(organizationId: string, userId: string): Promise<MemberResponse> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const existingMembership = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, userId)
          )
        )
        .limit(1);

      if (existingMembership.length > 0) {
        throw new ForbiddenError('User is already a member of this organization');
      }

      const [membership] = await db
        .insert(organizationMembers)
        .values({ organizationId, userId, role: 'member' })
        .returning();

      if (!membership) {
        logger.error('Failed to join organization: database insert returned empty', {
          organizationId,
          userId,
        });
        trackError(OPERATIONS.ORGANIZATION_JOIN, 'DB_INSERT_FAILED');
        throw new Error('Failed to join organization');
      }

      const [user] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const durationMs = Date.now() - startTime;
      logger.info('User joined organization', { organizationId, userId, durationMs });
      trackSuccess(OPERATIONS.ORGANIZATION_JOIN, durationMs);
      metrics.trackKpi(KPI_EVENTS.ORGANIZATION_JOINED, userId, organizationId);

      return {
        id: membership.id,
        userId: membership.userId,
        userName: user?.name ?? null,
        userEmail: user?.email ?? '',
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof ForbiddenError) {
        throw err;
      }
      if (err instanceof Error && err.message !== 'Failed to join organization') {
        logger.logError('Unexpected error joining organization', err, { organizationId, userId });
        trackError(OPERATIONS.ORGANIZATION_JOIN, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async addMember(organizationId: string, input: AddMemberInput): Promise<MemberResponse> {
    const startTime = Date.now();
    const { db } = this.deps;
    const { userId, role } = input;

    try {
      const [membership] = await db
        .insert(organizationMembers)
        .values({ organizationId, userId, role })
        .returning();

      if (!membership) {
        logger.error('Failed to add member: database insert returned empty', {
          organizationId,
          userId,
          role,
        });
        trackError(OPERATIONS.ORGANIZATION_ADD_MEMBER, 'DB_INSERT_FAILED');
        throw new Error('Failed to add member');
      }

      const [user] = await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const durationMs = Date.now() - startTime;
      logger.info('Member added to organization', { organizationId, userId, role, durationMs });
      trackSuccess(OPERATIONS.ORGANIZATION_ADD_MEMBER, durationMs);

      return {
        id: membership.id,
        userId: membership.userId,
        userName: user?.name ?? null,
        userEmail: user?.email ?? '',
        role: membership.role,
        createdAt: membership.createdAt.toISOString(),
      };
    } catch (err) {
      if (err instanceof Error && err.message !== 'Failed to add member') {
        logger.logError('Unexpected error adding member', err, { organizationId, userId, role });
        trackError(OPERATIONS.ORGANIZATION_ADD_MEMBER, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: MembershipRole
  ): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      await db
        .update(organizationMembers)
        .set({ role })
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, userId)
          )
        );

      const durationMs = Date.now() - startTime;
      logger.info('Member role updated', { organizationId, userId, newRole: role, durationMs });
      trackSuccess(OPERATIONS.ORGANIZATION_UPDATE_ROLE, durationMs);
    } catch (err) {
      logger.logError('Failed to update member role', err, { organizationId, userId, role });
      trackError(OPERATIONS.ORGANIZATION_UPDATE_ROLE, 'UNEXPECTED_ERROR');
      throw err;
    }
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      await db
        .delete(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organizationId),
            eq(organizationMembers.userId, userId)
          )
        );

      const durationMs = Date.now() - startTime;
      logger.info('Member removed from organization', { organizationId, userId, durationMs });
      trackSuccess(OPERATIONS.ORGANIZATION_REMOVE_MEMBER, durationMs);
    } catch (err) {
      logger.logError('Failed to remove member', err, { organizationId, userId });
      trackError(OPERATIONS.ORGANIZATION_REMOVE_MEMBER, 'UNEXPECTED_ERROR');
      throw err;
    }
  }

  async getOrganizationMembers(organizationId: string): Promise<MemberResponse[]> {
    const { db } = this.deps;

    const members = await db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        userName: users.name,
        userEmail: users.email,
        role: organizationMembers.role,
        createdAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, organizationId));

    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      userName: m.userName,
      userEmail: m.userEmail,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async getOrganizationBySlug(
    slug: string,
    userId: string
  ): Promise<(OrganizationResponse & { role: MembershipRole | null }) | null> {
    const { db } = this.deps;

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    if (!org) return null;

    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.userId, userId))
      )
      .limit(1);

    if (!org.isPublic && !membership) return null;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isPublic: org.isPublic,
      domainId: org.domainId,
      createdAt: org.createdAt.toISOString(),
      role: membership?.role ?? null,
    };
  }

  async isOrgAdmin(orgId: string, userId: string): Promise<boolean> {
    const { db } = this.deps;
    const [membership] = await db
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId))
      )
      .limit(1);
    return membership?.role === 'admin';
  }

  async getOrganizationMembersWithAgentsPaged(
    orgId: string,
    limit: number,
    offset: number
  ): Promise<{ members: MemberWithAgents[]; total: number }> {
    const { db } = this.deps;

    const [countResult] = await db
      .select({ count: count() })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgId));

    const total = countResult?.count ?? 0;

    const memberRows = await db
      .select({
        id: organizationMembers.id,
        userId: organizationMembers.userId,
        userName: users.name,
        userImage: users.image,
        userEmail: users.email,
        role: organizationMembers.role,
        createdAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, orgId))
      .orderBy(asc(organizationMembers.createdAt))
      .limit(limit)
      .offset(offset);

    if (memberRows.length === 0) return { members: [], total };

    const userIds = memberRows.map(m => m.userId);

    const agentRows = await db
      .select({
        id: agents.id,
        slug: agents.slug,
        displayName: agents.displayName,
        avatarUrl: agents.avatarUrl,
        isPublic: agents.isPublic,
        createdByUserId: agents.createdByUserId,
        apiKeyId: apiKeys.id,
      })
      .from(agents)
      .leftJoin(apiKeys, and(eq(apiKeys.agentId, agents.id), eq(apiKeys.organizationId, orgId)))
      .where(and(eq(agents.organizationId, orgId), inArray(agents.createdByUserId, userIds)));

    const agentsByUser = new Map<string, AgentSummary[]>();
    for (const a of agentRows) {
      const list = agentsByUser.get(a.createdByUserId) ?? [];
      list.push({
        id: a.id,
        slug: a.slug,
        displayName: a.displayName,
        avatarUrl: a.avatarUrl,
        isPublic: a.isPublic,
        apiKeyId: a.apiKeyId,
      });
      agentsByUser.set(a.createdByUserId, list);
    }

    return {
      members: memberRows.map(m => ({
        id: m.id,
        userId: m.userId,
        userName: m.userName,
        userImage: m.userImage,
        userEmail: m.userEmail,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
        agents: agentsByUser.get(m.userId) ?? [],
      })),
      total,
    };
  }

  async revokeAgentApiKeyInOrg(agentId: string, orgId: string): Promise<void> {
    const { db } = this.deps;
    await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.agentId, agentId), eq(apiKeys.organizationId, orgId)));
  }

  async ensureDeletedOrganization(): Promise<OrganizationResponse> {
    const { db } = this.deps;

    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, DELETED_ORG_ID))
      .limit(1);

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        slug: existing.slug,
        isPublic: existing.isPublic,
        domainId: existing.domainId,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    const [org] = await db
      .insert(organizations)
      .values({
        id: DELETED_ORG_ID,
        name: '[Deleted Organization]',
        slug: '_deleted',
        isPublic: false,
      })
      .onConflictDoNothing()
      .returning();

    if (!org) {
      const [refetched] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, DELETED_ORG_ID))
        .limit(1);

      if (!refetched) {
        throw new Error('Failed to create or find deleted organization sentinel');
      }

      return {
        id: refetched.id,
        name: refetched.name,
        slug: refetched.slug,
        isPublic: refetched.isPublic,
        domainId: refetched.domainId,
        createdAt: refetched.createdAt.toISOString(),
      };
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      isPublic: org.isPublic,
      domainId: org.domainId,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async deleteOrganizationWithContentPreservation(organizationId: string): Promise<void> {
    const { db } = this.deps;

    await this.ensureDeletedOrganization();

    await db.transaction(async tx => {
      await tx
        .update(issues)
        .set({ organizationId: DELETED_ORG_ID })
        .where(eq(issues.organizationId, organizationId));

      await tx
        .update(agents)
        .set({ organizationId: DELETED_ORG_ID })
        .where(eq(agents.organizationId, organizationId));

      await tx
        .update(badgeNominations)
        .set({ organizationId: DELETED_ORG_ID })
        .where(eq(badgeNominations.organizationId, organizationId));

      await tx
        .update(sharedContent)
        .set({ originOrganizationId: DELETED_ORG_ID })
        .where(eq(sharedContent.originOrganizationId, organizationId));

      await tx.delete(organizations).where(eq(organizations.id, organizationId));
    });

    logger.info('Organization deleted with content preservation', {
      organizationId,
      sentinelId: DELETED_ORG_ID,
    });
  }

  async getSettings(organizationId: string): Promise<Required<OrganizationSettings>> {
    const { db } = this.deps;
    const [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    return resolveOrgSettings(row?.settings as OrganizationSettings | null);
  }

  async updateSettings(
    organizationId: string,
    input: OrganizationSettings
  ): Promise<Required<OrganizationSettings>> {
    const { db } = this.deps;
    const validated = organizationSettingsSchema.parse(input);

    const [current] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!current) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const merged = { ...(current.settings as OrganizationSettings | null), ...validated };

    await db
      .update(organizations)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));

    logger.info('Organization settings updated', { organizationId, settings: merged });

    return resolveOrgSettings(merged);
  }
}

async function generateUniqueSlug(db: ServiceDependencies['db'], base: string): Promise<string> {
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, normalized))
    .limit(1);

  if (!existing) return normalized;

  const suffix = randomBytes(2).toString('hex');
  return `${normalized.slice(0, 46)}-${suffix}`;
}
