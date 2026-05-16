import { randomBytes } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import {
  users,
  sessions,
  accounts,
  apiKeys,
  issues,
  solutions,
  comments,
  votes,
  agents,
  organizationMembers,
  consentEvents,
  deletionRequests,
} from '@agent-in-sync/db-client';
import {
  CURRENT_TOS_VERSION,
  CURRENT_PRIVACY_POLICY_VERSION,
  type AcceptConsentInput,
} from '@agent-in-sync/shared';
import type { ServiceDependencies } from './dependencies.js';

export const DELETED_USER_ID = '00000000-0000-0000-0000-000000000000';

const DELETION_COOLOFF_DAYS = 7;

export class PrivacyService {
  private deps: ServiceDependencies;

  constructor(deps: ServiceDependencies) {
    this.deps = deps;
  }

  async recordConsent(
    userId: string,
    input: AcceptConsentInput,
    ipAddress: string | undefined,
    userAgent: string | undefined
  ): Promise<void> {
    const now = new Date();
    await this.deps.db.transaction(async tx => {
      await tx
        .update(users)
        .set({
          tosAcceptedAt: now,
          tosVersion: input.tosVersion,
          privacyPolicyAcceptedAt: now,
          privacyPolicyVersion: input.privacyPolicyVersion,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      await tx.insert(consentEvents).values([
        {
          userId,
          eventType: 'tos_accepted',
          version: input.tosVersion,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
        {
          userId,
          eventType: 'privacy_policy_accepted',
          version: input.privacyPolicyVersion,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      ]);
    });
  }

  async hasCurrentConsent(userId: string): Promise<boolean> {
    const [user] = await this.deps.db
      .select({
        tosVersion: users.tosVersion,
        privacyPolicyVersion: users.privacyPolicyVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) return false;

    return (
      user.tosVersion === CURRENT_TOS_VERSION &&
      user.privacyPolicyVersion === CURRENT_PRIVACY_POLICY_VERSION
    );
  }

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const db = this.deps.db;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        tier: users.tier,
        reputationScore: users.reputationScore,
        reputationLevel: users.reputationLevel,
        totalAcceptedSolutions: users.totalAcceptedSolutions,
        totalUpvotesReceived: users.totalUpvotesReceived,
        totalContributions: users.totalContributions,
        tosVersion: users.tosVersion,
        tosAcceptedAt: users.tosAcceptedAt,
        privacyPolicyVersion: users.privacyPolicyVersion,
        privacyPolicyAcceptedAt: users.privacyPolicyAcceptedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const userOrgMembers = await db
      .select({
        organizationId: organizationMembers.organizationId,
        role: organizationMembers.role,
        createdAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));

    const userApiKeys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));

    const userIssues = await db
      .select({
        id: issues.id,
        title: issues.title,
        organizationId: issues.organizationId,
        createdAt: issues.createdAt,
      })
      .from(issues)
      .where(eq(issues.authorId, userId));

    const userSolutions = await db
      .select({
        id: solutions.id,
        issueId: solutions.issueId,
        createdAt: solutions.createdAt,
      })
      .from(solutions)
      .where(eq(solutions.authorId, userId));

    const userComments = await db
      .select({
        id: comments.id,
        solutionId: comments.solutionId,
        content: comments.content,
        createdAt: comments.createdAt,
      })
      .from(comments)
      .where(eq(comments.authorId, userId));

    const userVotes = await db
      .select({
        id: votes.id,
        solutionId: votes.solutionId,
        direction: votes.direction,
        createdAt: votes.createdAt,
      })
      .from(votes)
      .where(eq(votes.userId, userId));

    const userAgents = await db
      .select({
        id: agents.id,
        slug: agents.slug,
        displayName: agents.displayName,
        createdAt: agents.createdAt,
      })
      .from(agents)
      .where(eq(agents.createdByUserId, userId));

    const userConsentEvents = await db
      .select({
        id: consentEvents.id,
        eventType: consentEvents.eventType,
        version: consentEvents.version,
        createdAt: consentEvents.createdAt,
      })
      .from(consentEvents)
      .where(eq(consentEvents.userId, userId));

    return {
      exportedAt: new Date().toISOString(),
      user,
      organizationMemberships: userOrgMembers,
      apiKeys: userApiKeys,
      issues: userIssues,
      solutions: userSolutions,
      comments: userComments,
      votes: userVotes,
      agents: userAgents,
      consentEvents: userConsentEvents,
    };
  }

  async requestDeletion(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const [existing] = await this.deps.db
      .select({ id: deletionRequests.id })
      .from(deletionRequests)
      .where(and(eq(deletionRequests.userId, userId), eq(deletionRequests.status, 'pending')))
      .limit(1);

    if (existing) {
      throw new Error('DELETION_ALREADY_REQUESTED');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + DELETION_COOLOFF_DAYS);

    await this.deps.db.insert(deletionRequests).values({
      userId,
      confirmationToken: token,
      expiresAt,
    });

    return { token, expiresAt };
  }

  async cancelDeletion(userId: string): Promise<void> {
    const [existing] = await this.deps.db
      .select({ id: deletionRequests.id })
      .from(deletionRequests)
      .where(and(eq(deletionRequests.userId, userId), eq(deletionRequests.status, 'pending')))
      .limit(1);

    if (!existing) {
      throw new Error('NO_PENDING_DELETION');
    }

    await this.deps.db
      .update(deletionRequests)
      .set({ status: 'cancelled' })
      .where(eq(deletionRequests.id, existing.id));
  }

  async getDeletionStatus(
    userId: string
  ): Promise<{ hasPending: boolean; expiresAt: Date | null }> {
    const [existing] = await this.deps.db
      .select({ expiresAt: deletionRequests.expiresAt })
      .from(deletionRequests)
      .where(and(eq(deletionRequests.userId, userId), eq(deletionRequests.status, 'pending')))
      .limit(1);

    return {
      hasPending: !!existing,
      expiresAt: existing?.expiresAt ?? null,
    };
  }

  async confirmDeletion(userId: string, token: string): Promise<void> {
    const [request] = await this.deps.db
      .select({
        id: deletionRequests.id,
        expiresAt: deletionRequests.expiresAt,
      })
      .from(deletionRequests)
      .where(
        and(
          eq(deletionRequests.userId, userId),
          eq(deletionRequests.status, 'pending'),
          eq(deletionRequests.confirmationToken, token)
        )
      )
      .limit(1);

    if (!request) {
      throw new Error('INVALID_DELETION_TOKEN');
    }

    if (request.expiresAt < new Date()) {
      throw new Error('DELETION_TOKEN_EXPIRED');
    }

    const anonymizedEmail = `deleted-${crypto.randomUUID()}@anonymized.local`;

    await this.deps.db.transaction(async tx => {
      await tx
        .update(users)
        .set({
          name: '[deleted]',
          email: anonymizedEmail,
          image: null,
          emailVerified: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(accounts).where(eq(accounts.userId, userId));
      await tx.delete(apiKeys).where(eq(apiKeys.userId, userId));

      await tx.update(issues).set({ authorId: DELETED_USER_ID }).where(eq(issues.authorId, userId));
      await tx
        .update(solutions)
        .set({ authorId: DELETED_USER_ID })
        .where(eq(solutions.authorId, userId));
      await tx
        .update(comments)
        .set({ authorId: DELETED_USER_ID })
        .where(eq(comments.authorId, userId));

      await tx.delete(votes).where(eq(votes.userId, userId));
      await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId));

      await tx
        .update(agents)
        .set({ createdByUserId: DELETED_USER_ID })
        .where(eq(agents.createdByUserId, userId));

      await tx.insert(consentEvents).values({
        userId,
        eventType: 'account_deleted',
        version: CURRENT_TOS_VERSION,
      });

      await tx
        .update(deletionRequests)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(deletionRequests.id, request.id));

      await tx.delete(users).where(eq(users.id, userId));
    });
  }
}
