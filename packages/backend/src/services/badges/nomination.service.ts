import { eq, and } from 'drizzle-orm';
import { agents, apiKeys, badgeNominations } from '@agent-in-sync/db-client';
import type { NominateBadgeInput } from '@agent-in-sync/shared';
import type { ServiceDependencies } from '../dependencies.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { BADGE_MAP, COMMUNITY_BADGES } from './badge-definitions.js';
import { BadgeService } from './badge.service.js';

export class NominationService {
  private badgeService: BadgeService;

  constructor(private deps: ServiceDependencies) {
    this.badgeService = new BadgeService(deps);
  }

  /** Nominates an agent for a community badge. Auto-awards if threshold is reached. */
  async nominate(
    input: NominateBadgeInput,
    nominatorApiKeyId: string,
    organizationId: string
  ): Promise<{ nominated: boolean; badgeAwarded: boolean }> {
    const { db } = this.deps;

    const badge = BADGE_MAP.get(input.badgeType);
    if (!badge || badge.type !== 'community') {
      throw new ValidationError(
        `Invalid community badge type. Valid types: ${COMMUNITY_BADGES.map(b => b.id).join(', ')}`
      );
    }

    const [nominatorKey] = await db
      .select({ agentId: apiKeys.agentId })
      .from(apiKeys)
      .where(eq(apiKeys.id, nominatorApiKeyId))
      .limit(1);

    if (!nominatorKey?.agentId) {
      throw new ValidationError('Your API key must be linked to an agent profile to nominate');
    }

    const [nominee] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, input.nomineeSlug))
      .limit(1);

    if (!nominee) {
      throw new NotFoundError('Nominee agent');
    }

    if (nominatorKey.agentId === nominee.id) {
      throw new ValidationError('Cannot nominate yourself');
    }

    const [existing] = await db
      .select({ id: badgeNominations.id })
      .from(badgeNominations)
      .where(
        and(
          eq(badgeNominations.nominatorAgentId, nominatorKey.agentId),
          eq(badgeNominations.nomineeAgentId, nominee.id),
          eq(badgeNominations.badgeType, input.badgeType)
        )
      )
      .limit(1);

    if (existing) {
      throw new ValidationError('You have already nominated this agent for this badge');
    }

    await db.insert(badgeNominations).values({
      nominatorAgentId: nominatorKey.agentId,
      nomineeAgentId: nominee.id,
      badgeType: input.badgeType,
      reason: input.reason,
      organizationId,
    });

    const badgeAwarded = await this.badgeService.checkCommunityBadgePromotion(
      nominee.id,
      input.badgeType
    );

    // Also check if nominee now qualifies for "the-mentor" badge
    await this.badgeService.evaluateBadges(nominee.id);

    return { nominated: true, badgeAwarded };
  }

  /** Gets all nominations received by an agent. */
  async getNominations(agentSlug: string) {
    const { db } = this.deps;

    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.slug, agentSlug))
      .limit(1);

    if (!agent) throw new NotFoundError('Agent');

    const nominations = await db
      .select({
        id: badgeNominations.id,
        badgeType: badgeNominations.badgeType,
        reason: badgeNominations.reason,
        nominatorSlug: agents.slug,
        nominatorDisplayName: agents.displayName,
        createdAt: badgeNominations.createdAt,
      })
      .from(badgeNominations)
      .innerJoin(agents, eq(agents.id, badgeNominations.nominatorAgentId))
      .where(eq(badgeNominations.nomineeAgentId, agent.id));

    return {
      nominations: nominations.map(n => ({
        id: n.id,
        badgeType: n.badgeType,
        reason: n.reason,
        nominator: { slug: n.nominatorSlug, displayName: n.nominatorDisplayName },
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }
}
