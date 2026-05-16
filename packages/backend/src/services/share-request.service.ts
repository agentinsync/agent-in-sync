import { z } from 'zod';
import { eq, and, desc, isNull } from 'drizzle-orm';
import {
  shareRequests,
  sharedContent,
  issues,
  users,
  organizations,
} from '@agent-in-sync/db-client';
import type { ServiceDependencies } from './dependencies.js';
import { OrganizationService } from './organization.service.js';
import type { MembershipRole } from './organization.service.js';
import { logger, trackSuccess, trackError, OPERATIONS } from '../observability/index.js';
import { SOLUTION_COLLECTION, ISSUE_COLLECTION } from '../weaviate/index.js';

export const createShareRequestSchema = z.object({
  issueId: z.string().uuid(),
});

export const approveShareRequestSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const rejectShareRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export type CreateShareRequestInput = z.infer<typeof createShareRequestSchema>;
export type ApproveShareRequestInput = z.infer<typeof approveShareRequestSchema>;
export type RejectShareRequestInput = z.infer<typeof rejectShareRequestSchema>;

export type ShareRequestResponse = {
  id: string;
  issueId: string;
  issueTitle: string;
  issueOrganizationId: string;
  requestedById: string;
  requestedByName: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  rejectionReason: string | null;
  approvalReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type ShareRequestApprovalResult = {
  shareRequestId: string;
  issueId: string;
  sharedContentId: string;
};

export class ShareRequestService {
  private organizationService: OrganizationService;

  constructor(private deps: ServiceDependencies) {
    this.organizationService = new OrganizationService(deps);
  }

  async createShareRequest(
    input: CreateShareRequestInput,
    requestedById: string,
    organizationId: string,
    membershipRole?: MembershipRole
  ): Promise<ShareRequestResponse | ShareRequestApprovalResult> {
    const startTime = Date.now();
    const { db } = this.deps;
    const { issueId } = input;
    const isAdmin = membershipRole === 'admin';

    try {
      const [issue] = await db
        .select({
          authorId: issues.authorId,
          title: issues.title,
          organizationId: issues.organizationId,
        })
        .from(issues)
        .where(eq(issues.id, issueId))
        .limit(1);

      if (!issue) {
        logger.warn('Share request failed: issue not found', { issueId, requestedById });
        trackError(OPERATIONS.SHARE_REQUEST_CREATE, 'ISSUE_NOT_FOUND');
        throw new Error('Issue not found');
      }

      if (issue.organizationId !== organizationId) {
        logger.warn('Share request failed: issue does not belong to organization', {
          issueId,
          organizationId,
          requestedById,
        });
        trackError(OPERATIONS.SHARE_REQUEST_CREATE, 'WRONG_ORGANIZATION');
        throw new Error('Issue does not belong to this organization');
      }

      if (!isAdmin && issue.authorId === requestedById) {
        logger.warn('Share request failed: user tried to share own issue', {
          issueId,
          requestedById,
        });
        trackError(OPERATIONS.SHARE_REQUEST_CREATE, 'OWN_ISSUE');
        throw new Error('Cannot request to share your own issue');
      }

      const [existingRequest] = await db
        .select()
        .from(shareRequests)
        .where(and(eq(shareRequests.issueId, issueId), eq(shareRequests.status, 'pending')))
        .limit(1);

      if (existingRequest) {
        logger.warn('Share request failed: pending request already exists', {
          issueId,
          existingRequestId: existingRequest.id,
        });
        trackError(OPERATIONS.SHARE_REQUEST_CREATE, 'DUPLICATE_REQUEST');
        throw new Error('A pending share request already exists for this issue');
      }

      const [request] = await db
        .insert(shareRequests)
        .values({ issueId, requestedById })
        .returning();

      if (!request) {
        logger.error('Share request creation failed: database insert returned empty', {
          issueId,
          requestedById,
        });
        trackError(OPERATIONS.SHARE_REQUEST_CREATE, 'DB_INSERT_FAILED');
        throw new Error('Failed to create share request');
      }

      const durationMs = Date.now() - startTime;
      logger.info('Share request created successfully', {
        shareRequestId: request.id,
        issueId,
        requestedById,
        isAdmin,
        durationMs,
      });
      trackSuccess(OPERATIONS.SHARE_REQUEST_CREATE, durationMs);

      // Admins get auto-approved — skip the review step
      if (isAdmin) {
        return this.approveShareRequest(request.id, requestedById, organizationId);
      }

      const [requester] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, requestedById))
        .limit(1);

      return {
        id: request.id,
        issueId: request.issueId,
        issueTitle: issue.title,
        issueOrganizationId: organizationId,
        requestedById: request.requestedById,
        requestedByName: requester?.name ?? null,
        reviewedById: null,
        reviewedByName: null,
        status: request.status,
        rejectionReason: null,
        approvalReason: null,
        createdAt: request.createdAt.toISOString(),
        reviewedAt: null,
      };
    } catch (err) {
      const knownErrors = [
        'Issue not found',
        'Issue does not belong',
        'Cannot request to share',
        'A pending share request',
        'Failed to create',
      ];
      if (err instanceof Error && !knownErrors.some(msg => err.message.includes(msg))) {
        logger.logError('Unexpected error creating share request', err, {
          issueId,
          requestedById,
          organizationId,
        });
        trackError(OPERATIONS.SHARE_REQUEST_CREATE, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async getPendingShareRequests(organizationId: string): Promise<ShareRequestResponse[]> {
    const { db } = this.deps;

    const requests = await db
      .select({
        id: shareRequests.id,
        issueId: shareRequests.issueId,
        issueTitle: issues.title,
        requestedById: shareRequests.requestedById,
        requestedByName: users.name,
        status: shareRequests.status,
        rejectionReason: shareRequests.rejectionReason,
        approvalReason: shareRequests.approvalReason,
        createdAt: shareRequests.createdAt,
        reviewedAt: shareRequests.reviewedAt,
      })
      .from(shareRequests)
      .innerJoin(issues, eq(shareRequests.issueId, issues.id))
      .innerJoin(users, eq(shareRequests.requestedById, users.id))
      .where(and(eq(issues.organizationId, organizationId), eq(shareRequests.status, 'pending')))
      .orderBy(desc(shareRequests.createdAt));

    return requests.map(r => ({
      id: r.id,
      issueId: r.issueId,
      issueTitle: r.issueTitle,
      issueOrganizationId: organizationId,
      requestedById: r.requestedById,
      requestedByName: r.requestedByName,
      reviewedById: null,
      reviewedByName: null,
      status: r.status,
      rejectionReason: r.rejectionReason,
      approvalReason: r.approvalReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    }));
  }

  async getShareRequest(requestId: string): Promise<ShareRequestResponse | null> {
    const { db } = this.deps;

    const [request] = await db
      .select({
        id: shareRequests.id,
        issueId: shareRequests.issueId,
        issueTitle: issues.title,
        issueOrganizationId: issues.organizationId,
        requestedById: shareRequests.requestedById,
        reviewedById: shareRequests.reviewedById,
        status: shareRequests.status,
        rejectionReason: shareRequests.rejectionReason,
        approvalReason: shareRequests.approvalReason,
        createdAt: shareRequests.createdAt,
        reviewedAt: shareRequests.reviewedAt,
      })
      .from(shareRequests)
      .innerJoin(issues, eq(shareRequests.issueId, issues.id))
      .where(eq(shareRequests.id, requestId))
      .limit(1);

    if (!request) return null;

    const [requester] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, request.requestedById))
      .limit(1);

    let reviewerName: string | null = null;
    if (request.reviewedById) {
      const [reviewer] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, request.reviewedById))
        .limit(1);
      reviewerName = reviewer?.name ?? null;
    }

    return {
      id: request.id,
      issueId: request.issueId,
      issueTitle: request.issueTitle,
      issueOrganizationId: request.issueOrganizationId,
      requestedById: request.requestedById,
      requestedByName: requester?.name ?? null,
      reviewedById: request.reviewedById,
      reviewedByName: reviewerName,
      status: request.status,
      rejectionReason: request.rejectionReason,
      approvalReason: request.approvalReason,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
    };
  }

  async approveShareRequest(
    requestId: string,
    reviewerId: string,
    organizationId: string,
    reason?: string
  ): Promise<ShareRequestApprovalResult> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [request] = await db
        .select({
          id: shareRequests.id,
          issueId: shareRequests.issueId,
          status: shareRequests.status,
          issueOrgId: issues.organizationId,
        })
        .from(shareRequests)
        .innerJoin(issues, eq(shareRequests.issueId, issues.id))
        .where(eq(shareRequests.id, requestId))
        .limit(1);

      if (!request) {
        logger.warn('Share request approval failed: request not found', { requestId, reviewerId });
        trackError(OPERATIONS.SHARE_REQUEST_APPROVE, 'REQUEST_NOT_FOUND');
        throw new Error('Share request not found');
      }

      if (request.issueOrgId !== organizationId) {
        logger.warn('Share request approval failed: wrong organization', {
          requestId,
          organizationId,
        });
        trackError(OPERATIONS.SHARE_REQUEST_APPROVE, 'WRONG_ORGANIZATION');
        throw new Error('Share request does not belong to this organization');
      }

      if (request.status !== 'pending') {
        logger.warn('Share request approval failed: already processed', {
          requestId,
          status: request.status,
        });
        trackError(OPERATIONS.SHARE_REQUEST_APPROVE, 'ALREADY_PROCESSED');
        throw new Error('Share request has already been processed');
      }

      const publicOrg = await this.organizationService.ensurePublicOrganization();

      const result = await db.transaction(async tx => {
        // Move issue: set organizationId to public org, store origin
        await tx
          .update(issues)
          .set({
            organizationId: publicOrg.id,
            originOrganizationId: organizationId,
          })
          .where(eq(issues.id, request.issueId));

        // Create shared_content audit record
        const [shared] = await tx
          .insert(sharedContent)
          .values({
            issueId: request.issueId,
            originOrganizationId: organizationId,
            shareRequestId: requestId,
          })
          .returning();

        if (!shared) {
          trackError(OPERATIONS.SHARE_REQUEST_APPROVE, 'SHARED_CONTENT_FAILED');
          throw new Error('Failed to create shared content record');
        }

        // Mark share request as approved
        await tx
          .update(shareRequests)
          .set({
            status: 'approved',
            reviewedById: reviewerId,
            reviewedAt: new Date(),
            approvalReason: reason ?? null,
          })
          .where(eq(shareRequests.id, requestId));

        return { sharedContentId: shared.id };
      });

      // Update Weaviate vectors to reflect new organizationId (fire-and-forget)
      this.updateWeaviateOrganization(request.issueId, publicOrg.id).catch(err => {
        logger.logError('Failed to update Weaviate vectors after share approval', err, {
          issueId: request.issueId,
        });
      });

      const durationMs = Date.now() - startTime;
      logger.info('Share request approved (move model)', {
        shareRequestId: requestId,
        issueId: request.issueId,
        sharedContentId: result.sharedContentId,
        reviewerId,
        durationMs,
      });
      trackSuccess(OPERATIONS.SHARE_REQUEST_APPROVE, durationMs);

      return {
        shareRequestId: requestId,
        issueId: request.issueId,
        sharedContentId: result.sharedContentId,
      };
    } catch (err) {
      const knownErrors = [
        'Share request not found',
        'does not belong',
        'already been processed',
        'Failed to create',
      ];
      if (err instanceof Error && !knownErrors.some(msg => err.message.includes(msg))) {
        logger.logError('Unexpected error approving share request', err, {
          requestId,
          reviewerId,
          organizationId,
        });
        trackError(OPERATIONS.SHARE_REQUEST_APPROVE, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  private async updateWeaviateOrganization(issueId: string, newOrgId: string): Promise<void> {
    const issuesUpdated = await updateWeaviateOrganizationForCollection(
      this.deps,
      ISSUE_COLLECTION,
      'issueId',
      issueId,
      newOrgId
    );
    const solutionsUpdated = await updateWeaviateOrganizationForCollection(
      this.deps,
      SOLUTION_COLLECTION,
      'issueId',
      issueId,
      newOrgId
    );
    logger.info('Updated Weaviate vectors for issue move', {
      issueId,
      newOrgId,
      issuesUpdated,
      solutionsUpdated,
    });
  }

  async rejectShareRequest(
    requestId: string,
    reviewerId: string,
    input: RejectShareRequestInput,
    organizationId: string
  ): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [request] = await db
        .select({
          id: shareRequests.id,
          status: shareRequests.status,
          issueOrgId: issues.organizationId,
        })
        .from(shareRequests)
        .innerJoin(issues, eq(shareRequests.issueId, issues.id))
        .where(eq(shareRequests.id, requestId))
        .limit(1);

      if (!request) {
        logger.warn('Share request rejection failed: request not found', { requestId, reviewerId });
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'REQUEST_NOT_FOUND');
        throw new Error('Share request not found');
      }

      if (request.issueOrgId !== organizationId) {
        logger.warn('Share request rejection failed: wrong organization', {
          requestId,
          organizationId,
        });
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'WRONG_ORGANIZATION');
        throw new Error('Share request does not belong to this organization');
      }

      if (request.status !== 'pending') {
        logger.warn('Share request rejection failed: already processed', {
          requestId,
          status: request.status,
        });
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'ALREADY_PROCESSED');
        throw new Error('Share request has already been processed');
      }

      await db
        .update(shareRequests)
        .set({
          status: 'rejected',
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          rejectionReason: input.reason,
        })
        .where(eq(shareRequests.id, requestId));

      const durationMs = Date.now() - startTime;
      logger.info('Share request rejected', { shareRequestId: requestId, reviewerId, durationMs });
      trackSuccess(OPERATIONS.SHARE_REQUEST_REJECT, durationMs);
    } catch (err) {
      const knownErrors = ['Share request not found', 'does not belong', 'already been processed'];
      if (err instanceof Error && !knownErrors.some(msg => err.message.includes(msg))) {
        logger.logError('Unexpected error rejecting share request', err, {
          requestId,
          reviewerId,
          organizationId,
        });
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async getSharedContentByIssue(issueId: string): Promise<{
    originOrganizationId: string;
    originOrganizationName: string;
    sharedAt: string;
  } | null> {
    const { db } = this.deps;

    const [shared] = await db
      .select({
        originOrganizationId: sharedContent.originOrganizationId,
        originOrganizationName: organizations.name,
        sharedAt: sharedContent.sharedAt,
        revokedAt: sharedContent.revokedAt,
      })
      .from(sharedContent)
      .innerJoin(organizations, eq(sharedContent.originOrganizationId, organizations.id))
      .where(and(eq(sharedContent.issueId, issueId), isNull(sharedContent.revokedAt)))
      .limit(1);

    if (!shared) return null;

    return {
      originOrganizationId: shared.originOrganizationId,
      originOrganizationName: shared.originOrganizationName,
      sharedAt: shared.sharedAt.toISOString(),
    };
  }

  async revokeShareRequest(
    requestId: string,
    reviewerId: string,
    organizationId: string,
    reason?: string
  ): Promise<void> {
    const startTime = Date.now();
    const { db } = this.deps;

    try {
      const [request] = await db
        .select({
          id: shareRequests.id,
          issueId: shareRequests.issueId,
          status: shareRequests.status,
        })
        .from(shareRequests)
        .where(eq(shareRequests.id, requestId))
        .limit(1);

      if (!request) {
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'REQUEST_NOT_FOUND');
        throw new Error('Share request not found');
      }

      if (request.status !== 'approved') {
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'NOT_APPROVED');
        throw new Error('Only approved share requests can be revoked');
      }

      // Find the shared content record to verify organization ownership
      const [shared] = await db
        .select()
        .from(sharedContent)
        .where(and(eq(sharedContent.shareRequestId, requestId), isNull(sharedContent.revokedAt)))
        .limit(1);

      if (!shared) {
        throw new Error('Active shared content not found for this request');
      }

      if (shared.originOrganizationId !== organizationId) {
        throw new Error('Share request does not belong to this organization');
      }

      await db.transaction(async tx => {
        // Move issue back to origin organization
        await tx
          .update(issues)
          .set({
            organizationId,
            originOrganizationId: null,
          })
          .where(eq(issues.id, request.issueId));

        // Mark shared content as revoked
        await tx
          .update(sharedContent)
          .set({ revokedAt: new Date() })
          .where(eq(sharedContent.id, shared.id));

        // Mark share request as revoked
        await tx
          .update(shareRequests)
          .set({
            status: 'revoked',
            reviewedById: reviewerId,
            reviewedAt: new Date(),
            rejectionReason: reason ?? null,
          })
          .where(eq(shareRequests.id, requestId));
      });

      // Update Weaviate vectors back to origin org (fire-and-forget)
      this.updateWeaviateOrganization(request.issueId, organizationId).catch(err => {
        logger.logError('Failed to update Weaviate vectors after revoke', err, {
          issueId: request.issueId,
        });
      });

      const durationMs = Date.now() - startTime;
      logger.info('Share request revoked', {
        shareRequestId: requestId,
        issueId: request.issueId,
        reviewerId,
        durationMs,
      });
      trackSuccess(OPERATIONS.SHARE_REQUEST_REJECT, durationMs);
    } catch (err) {
      const knownErrors = [
        'Share request not found',
        'Only approved',
        'Active shared content not found',
        'does not belong',
      ];
      if (err instanceof Error && !knownErrors.some(msg => err.message.includes(msg))) {
        logger.logError('Unexpected error revoking share request', err, {
          requestId,
          reviewerId,
          organizationId,
        });
        trackError(OPERATIONS.SHARE_REQUEST_REJECT, 'UNEXPECTED_ERROR');
      }
      throw err;
    }
  }

  async getApprovedShareRequests(organizationId: string): Promise<ShareRequestResponse[]> {
    const { db } = this.deps;

    const requests = await db
      .select({
        id: shareRequests.id,
        issueId: shareRequests.issueId,
        issueTitle: issues.title,
        requestedById: shareRequests.requestedById,
        requestedByName: users.name,
        reviewedById: shareRequests.reviewedById,
        status: shareRequests.status,
        rejectionReason: shareRequests.rejectionReason,
        approvalReason: shareRequests.approvalReason,
        createdAt: shareRequests.createdAt,
        reviewedAt: shareRequests.reviewedAt,
      })
      .from(shareRequests)
      .innerJoin(issues, eq(shareRequests.issueId, issues.id))
      .innerJoin(users, eq(shareRequests.requestedById, users.id))
      .innerJoin(
        sharedContent,
        and(eq(sharedContent.shareRequestId, shareRequests.id), isNull(sharedContent.revokedAt))
      )
      .where(
        and(
          eq(sharedContent.originOrganizationId, organizationId),
          eq(shareRequests.status, 'approved')
        )
      )
      .orderBy(desc(shareRequests.reviewedAt));

    return requests.map(r => ({
      id: r.id,
      issueId: r.issueId,
      issueTitle: r.issueTitle,
      issueOrganizationId: organizationId,
      requestedById: r.requestedById,
      requestedByName: r.requestedByName,
      reviewedById: r.reviewedById,
      reviewedByName: null,
      status: r.status as 'approved',
      rejectionReason: r.rejectionReason,
      approvalReason: r.approvalReason,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    }));
  }
}

// -- Weaviate helper (bottom of file) --

async function updateWeaviateOrganizationForCollection(
  deps: ServiceDependencies,
  collectionName: string,
  filterProperty: string,
  filterValue: string,
  newOrganizationId: string
): Promise<number> {
  const { weaviateClient } = deps;
  if (!weaviateClient) return 0;

  const collection = weaviateClient.collections.get(collectionName);
  const existing = await collection.query.fetchObjects({
    filters: collection.filter.byProperty(filterProperty).equal(filterValue),
    limit: 100,
  });

  let updated = 0;
  for (const obj of existing.objects) {
    await collection.data.update({
      id: obj.uuid,
      properties: { organizationId: newOrganizationId },
    });
    updated++;
  }
  return updated;
}
