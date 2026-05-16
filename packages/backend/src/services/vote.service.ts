import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { solutions, votes, issues, organizations } from '@agent-in-sync/db-client';
import { SOLUTION_COLLECTION, type SolutionVector } from '../weaviate/index.js';
import type { ServiceDependencies } from './dependencies.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import { ForbiddenError } from '../errors/index.js';
import { TrustService } from './trust.service.js';
import { BadgeService } from './badges/badge.service.js';
import { writeAudit } from './audit.js';

export const voteSchema = z.object({
  solution_id: z.string().uuid(),
  vote: z.enum(['up', 'down']),
  context: z.string().max(500).optional(),
});

export type VoteInput = z.infer<typeof voteSchema>;

export type VoteResponse = {
  new_vote_count: number;
};

export class VoteService {
  private trustService: TrustService;
  private publicOrgId: string | null | undefined = undefined;

  constructor(private deps: ServiceDependencies) {
    this.trustService = new TrustService(deps);
  }

  private async getPublicOrgId(): Promise<string | null> {
    if (this.publicOrgId !== undefined) return this.publicOrgId;
    const [publicOrg] = await this.deps.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.isPublic, true))
      .limit(1);
    const id = publicOrg?.id ?? null;
    this.publicOrgId = id;
    return id;
  }

  private async updateWeaviateVoteCount(solutionId: string, newCount: number): Promise<void> {
    const { weaviateClient } = this.deps;
    if (!weaviateClient) return;

    const startTime = Date.now();
    try {
      const collection = weaviateClient.collections.get<SolutionVector>(SOLUTION_COLLECTION);

      const existing = await collection.query.fetchObjects({
        filters: collection.filter.byProperty('solutionId').equal(solutionId),
        limit: 1,
      });

      const firstObject = existing.objects[0];
      if (firstObject) {
        await collection.data.update({
          id: firstObject.uuid,
          properties: { voteCount: newCount },
        });
        trackSuccess(OPERATIONS.WEAVIATE_UPDATE, Date.now() - startTime);
      }
    } catch (err) {
      logger.logError('Failed to update Weaviate vote count', err, { solutionId, newCount });
      trackError(OPERATIONS.WEAVIATE_UPDATE, 'WEAVIATE_ERROR');
    }
  }

  async vote(
    input: VoteInput,
    userId: string,
    organizationId: string,
    apiKeyId?: string,
    agentId?: string
  ): Promise<VoteResponse> {
    const startTime = Date.now();
    const { db } = this.deps;
    const { solution_id, vote: voteDirection, context } = input;

    try {
      const [solutionWithIssue] = await db
        .select({
          id: solutions.id,
          voteCount: solutions.voteCount,
          issueOrgId: issues.organizationId,
          authorApiKeyId: solutions.authorApiKeyId,
          authorId: solutions.authorId,
        })
        .from(solutions)
        .innerJoin(issues, eq(solutions.issueId, issues.id))
        .where(eq(solutions.id, solution_id))
        .limit(1);

      if (!solutionWithIssue) {
        logger.warn('Vote failed: solution not found', { solutionId: solution_id, userId });
        trackError(OPERATIONS.VOTE_CAST, 'SOLUTION_NOT_FOUND');
        throw new Error('SOLUTION_NOT_FOUND');
      }

      if (
        solutionWithIssue.issueOrgId !== organizationId &&
        solutionWithIssue.issueOrgId !== (await this.getPublicOrgId())
      ) {
        logger.warn('Vote failed: solution belongs to different organization', {
          solutionId: solution_id,
          userId,
          solutionOrgId: solutionWithIssue.issueOrgId,
          userOrgId: organizationId,
        });
        trackError(OPERATIONS.VOTE_CAST, 'ORG_MISMATCH');
        throw new ForbiddenError('Solution does not belong to your organization');
      }

      const { updated, voteAction } = await db.transaction(async tx => {
        const [existingVote] = await tx
          .select({ id: votes.id, direction: votes.direction })
          .from(votes)
          .where(and(eq(votes.solutionId, solution_id), eq(votes.userId, userId)))
          .limit(1);

        let voteChange = 0;
        let txVoteAction: 'created' | 'updated' | 'removed';
        let txUpvoteDelta = 0;
        let txDownvoteDelta = 0;

        if (existingVote) {
          if (existingVote.direction === voteDirection) {
            await tx.delete(votes).where(eq(votes.id, existingVote.id));
            voteChange = voteDirection === 'up' ? -1 : 1;
            txVoteAction = 'removed';
            if (voteDirection === 'up') {
              txUpvoteDelta = -1;
            } else {
              txDownvoteDelta = -1;
            }
          } else {
            await tx
              .update(votes)
              .set({ direction: voteDirection, context })
              .where(eq(votes.id, existingVote.id));
            voteChange = voteDirection === 'up' ? 2 : -2;
            txVoteAction = 'updated';
            if (voteDirection === 'up') {
              txUpvoteDelta = 1;
              txDownvoteDelta = -1;
            } else {
              txUpvoteDelta = -1;
              txDownvoteDelta = 1;
            }
          }
        } else {
          await tx.insert(votes).values({
            solutionId: solution_id,
            userId,
            apiKeyId: apiKeyId ?? null,
            agentId: agentId ?? null,
            direction: voteDirection,
            context: context ?? null,
          });
          voteChange = voteDirection === 'up' ? 1 : -1;
          txVoteAction = 'created';
          if (voteDirection === 'up') {
            txUpvoteDelta = 1;
          } else {
            txDownvoteDelta = 1;
          }
        }

        const [txUpdated] = await tx
          .update(solutions)
          .set({ voteCount: sql`${solutions.voteCount} + ${voteChange}` })
          .where(eq(solutions.id, solution_id))
          .returning({ voteCount: solutions.voteCount });

        if (!txUpdated) {
          logger.error('Vote failed: could not update solution vote count', {
            solutionId: solution_id,
            userId,
          });
          trackError(OPERATIONS.VOTE_CAST, 'DB_UPDATE_FAILED');
          throw new Error('Failed to update vote count');
        }

        // Update trust stats for the solution author's API key
        if (solutionWithIssue.authorApiKeyId) {
          if (txUpvoteDelta !== 0) {
            await this.trustService.incrementStat(
              solutionWithIssue.authorApiKeyId,
              'totalUpvotes',
              txUpvoteDelta
            );
          }
          if (txDownvoteDelta !== 0) {
            await this.trustService.incrementStat(
              solutionWithIssue.authorApiKeyId,
              'totalDownvotes',
              txDownvoteDelta
            );
          }
          // Check if trust level should change
          await this.trustService.checkTrustLevelTransition(solutionWithIssue.authorApiKeyId);
          // Update user reputation
          await this.trustService.updateUserReputationFromApiKeys(solutionWithIssue.authorId);
        }

        return {
          updated: txUpdated,
          voteAction: txVoteAction,
          upvoteDelta: txUpvoteDelta,
          downvoteDelta: txDownvoteDelta,
        };
      });

      // Non-blocking badge evaluation (outside transaction)
      if (solutionWithIssue.authorApiKeyId) {
        new BadgeService(this.deps)
          .evaluateForApiKey(solutionWithIssue.authorApiKeyId)
          .catch(() => {});
      }
      if (apiKeyId) {
        new BadgeService(this.deps).evaluateForApiKey(apiKeyId).catch(() => {});
      }

      // Weaviate update (outside transaction)
      await this.updateWeaviateVoteCount(solution_id, updated.voteCount);

      const durationMs = Date.now() - startTime;
      logger.info('Vote recorded successfully', {
        solutionId: solution_id,
        userId,
        voteDirection,
        voteAction,
        newVoteCount: updated.voteCount,
        durationMs,
      });
      trackSuccess(OPERATIONS.VOTE_CAST, durationMs, { direction: voteDirection });

      writeAudit(db, userId, 'vote.cast', 'solution', solution_id, {
        direction: voteDirection,
        voteAction,
        isBot: !!apiKeyId,
        agentId: agentId ?? null,
      });

      return { new_vote_count: updated.voteCount };
    } catch (err) {
      if (
        err instanceof Error &&
        err.message !== 'SOLUTION_NOT_FOUND' &&
        err.message !== 'Failed to update vote count'
      ) {
        logger.logError('Unexpected error in vote', err, {
          solutionId: solution_id,
          userId,
          voteDirection,
        });
        trackError(OPERATIONS.VOTE_CAST, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }
}
