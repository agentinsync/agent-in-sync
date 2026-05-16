import { describe, it, expect } from 'vitest';
import { ShareRequestService } from './share-request.service.js';
import { MockDbBuilder, createMockDeps } from '../test-utils/mocks.js';
import { anIssue, aUser, anOrganization, aShareRequest } from '../test-utils/builders.js';

describe('ShareRequestService', () => {
  describe('createShareRequest', () => {
    const requestedById = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    describe('Given issue does not exist', () => {
      it('Then throws "Issue not found" error', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.createShareRequest(
            { issueId: crypto.randomUUID() },
            requestedById,
            organizationId
          )
        ).rejects.toThrow('Issue not found');
      });
    });

    describe('Given issue belongs to different organization', () => {
      it('Then throws "Issue does not belong to this organization" error', async () => {
        const issue = anIssue().withOrganizationId(crypto.randomUUID()).build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            { authorId: issue.authorId, title: issue.title, organizationId: issue.organizationId },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.createShareRequest({ issueId: issue.id }, requestedById, organizationId)
        ).rejects.toThrow('Issue does not belong to this organization');
      });
    });

    describe('Given non-admin user tries to share their own issue', () => {
      it('Then throws "Cannot request to share your own issue" error', async () => {
        const issue = anIssue()
          .withOrganizationId(organizationId)
          .withAuthorId(requestedById)
          .build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            { authorId: requestedById, title: issue.title, organizationId: organizationId },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.createShareRequest({ issueId: issue.id }, requestedById, organizationId)
        ).rejects.toThrow('Cannot request to share your own issue');
      });
    });

    describe('Given admin shares their own issue', () => {
      it('Then creates share request and auto-approves (move model)', async () => {
        const issue = anIssue()
          .withOrganizationId(organizationId)
          .withAuthorId(requestedById)
          .build();
        const newRequest = aShareRequest()
          .withIssueId(issue.id)
          .withRequestedById(requestedById)
          .build();
        const publicOrg = anOrganization().withName('Public').withSlug('public').build();
        const sharedContentId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          // createShareRequest: issue lookup
          .mockResult([
            { authorId: requestedById, title: issue.title, organizationId: organizationId },
          ])
          // createShareRequest: existing pending request check
          .mockResult([])
          // createShareRequest: insert share request
          .mockResult([newRequest])
          // approveShareRequest: share request lookup
          .mockResult([
            {
              id: newRequest.id,
              issueId: issue.id,
              status: 'pending',
              issueOrgId: organizationId,
            },
          ])
          // ensurePublicOrganization → getPublicOrganization
          .mockResult([
            {
              id: publicOrg.id,
              name: 'Public',
              slug: 'public',
              isPublic: true,
              domainId: null,
              createdAt: new Date(),
            },
          ])
          // transaction: update issue organizationId (move)
          .mockResult(undefined)
          // transaction: insert shared content
          .mockResult([{ id: sharedContentId }])
          // transaction: update share request status
          .mockResult(undefined)
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.createShareRequest(
          { issueId: issue.id },
          requestedById,
          organizationId,
          'admin'
        );

        expect(result).toHaveProperty('shareRequestId');
        expect(result).toHaveProperty('issueId', issue.id);
        expect(result).toHaveProperty('sharedContentId', sharedContentId);
      });
    });

    describe('Given admin shares another users issue', () => {
      it('Then creates share request and auto-approves (move model)', async () => {
        const authorId = crypto.randomUUID();
        const issue = anIssue().withOrganizationId(organizationId).withAuthorId(authorId).build();
        const newRequest = aShareRequest()
          .withIssueId(issue.id)
          .withRequestedById(requestedById)
          .build();
        const publicOrg = anOrganization().withName('Public').withSlug('public').build();
        const sharedContentId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          // createShareRequest: issue lookup
          .mockResult([{ authorId, title: issue.title, organizationId }])
          // createShareRequest: existing pending request check
          .mockResult([])
          // createShareRequest: insert share request
          .mockResult([newRequest])
          // approveShareRequest: share request lookup
          .mockResult([
            {
              id: newRequest.id,
              issueId: issue.id,
              status: 'pending',
              issueOrgId: organizationId,
            },
          ])
          // ensurePublicOrganization → getPublicOrganization
          .mockResult([
            {
              id: publicOrg.id,
              name: 'Public',
              slug: 'public',
              isPublic: true,
              domainId: null,
              createdAt: new Date(),
            },
          ])
          // transaction: update issue organizationId (move)
          .mockResult(undefined)
          // transaction: insert shared content
          .mockResult([{ id: sharedContentId }])
          // transaction: update share request status
          .mockResult(undefined)
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.createShareRequest(
          { issueId: issue.id },
          requestedById,
          organizationId,
          'admin'
        );

        expect(result).toHaveProperty('shareRequestId');
        expect(result).toHaveProperty('issueId', issue.id);
        expect(result).toHaveProperty('sharedContentId', sharedContentId);
      });
    });

    describe('Given member (non-admin) shares another users issue', () => {
      it('Then creates a pending share request without auto-approval', async () => {
        const authorId = crypto.randomUUID();
        const issue = anIssue().withOrganizationId(organizationId).withAuthorId(authorId).build();
        const newRequest = aShareRequest()
          .withIssueId(issue.id)
          .withRequestedById(requestedById)
          .build();
        const requester = aUser().withId(requestedById).build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ authorId, title: issue.title, organizationId }])
          .mockResult([])
          .mockResult([newRequest])
          .mockResult([{ name: requester.name }])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.createShareRequest(
          { issueId: issue.id },
          requestedById,
          organizationId,
          'member'
        );

        expect(result).toHaveProperty('status', 'pending');
        expect(result).toHaveProperty('id', newRequest.id);
      });
    });

    describe('Given pending share request already exists', () => {
      it('Then throws "A pending share request already exists" error', async () => {
        const authorId = crypto.randomUUID();
        const issue = anIssue().withOrganizationId(organizationId).withAuthorId(authorId).build();
        const existingRequest = aShareRequest().withIssueId(issue.id).withStatus('pending').build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ authorId, title: issue.title, organizationId }])
          .mockResult([existingRequest])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.createShareRequest({ issueId: issue.id }, requestedById, organizationId)
        ).rejects.toThrow('A pending share request already exists for this issue');
      });
    });

    describe('Given valid share request', () => {
      it('Then creates and returns the share request', async () => {
        const authorId = crypto.randomUUID();
        const issue = anIssue().withOrganizationId(organizationId).withAuthorId(authorId).build();
        const newRequest = aShareRequest()
          .withIssueId(issue.id)
          .withRequestedById(requestedById)
          .build();
        const requester = aUser().withId(requestedById).build();

        const mockDb = new MockDbBuilder()
          .mockResult([{ authorId, title: issue.title, organizationId }])
          .mockResult([])
          .mockResult([newRequest])
          .mockResult([{ name: requester.name }])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.createShareRequest(
          { issueId: issue.id },
          requestedById,
          organizationId
        );

        expect(mockDb.insert).toHaveBeenCalled();
        expect((result as { id: string }).id).toBe(newRequest.id);
        expect((result as { status: string }).status).toBe('pending');
      });
    });
  });

  describe('getPendingShareRequests', () => {
    const organizationId = crypto.randomUUID();

    describe('Given pending requests exist', () => {
      it('Then returns all pending requests', async () => {
        const request1 = aShareRequest().withStatus('pending').build();
        const request2 = aShareRequest().withStatus('pending').build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request1.id,
              issueId: request1.issueId,
              issueTitle: 'Issue 1',
              requestedById: request1.requestedById,
              requestedByName: 'User 1',
              status: 'pending',
              rejectionReason: null,
              createdAt: request1.createdAt,
              reviewedAt: null,
            },
            {
              id: request2.id,
              issueId: request2.issueId,
              issueTitle: 'Issue 2',
              requestedById: request2.requestedById,
              requestedByName: 'User 2',
              status: 'pending',
              rejectionReason: null,
              createdAt: request2.createdAt,
              reviewedAt: null,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.getPendingShareRequests(organizationId);

        expect(result).toHaveLength(2);
        expect(result[0]?.status).toBe('pending');
        expect(result[1]?.status).toBe('pending');
      });
    });

    describe('Given no pending requests exist', () => {
      it('Then returns empty array', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.getPendingShareRequests(organizationId);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('getShareRequest', () => {
    describe('Given share request does not exist', () => {
      it('Then returns null', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.getShareRequest(crypto.randomUUID());

        expect(result).toBeNull();
      });
    });

    describe('Given share request exists without reviewer', () => {
      it('Then returns request with requester info', async () => {
        const request = aShareRequest().withStatus('pending').build();
        const requester = aUser().withId(request.requestedById).build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              issueId: request.issueId,
              issueTitle: 'Test Issue',
              requestedById: request.requestedById,
              reviewedById: null,
              status: 'pending',
              rejectionReason: null,
              createdAt: request.createdAt,
              reviewedAt: null,
            },
          ])
          .mockResult([{ name: requester.name }])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.getShareRequest(request.id);

        expect(result).not.toBeNull();
        expect(result?.status).toBe('pending');
        expect(result?.reviewedById).toBeNull();
      });
    });
  });

  describe('approveShareRequest', () => {
    const reviewerId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    describe('Given share request does not exist', () => {
      it('Then throws "Share request not found" error', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.approveShareRequest(crypto.randomUUID(), reviewerId, organizationId)
        ).rejects.toThrow('Share request not found');
      });
    });

    describe('Given share request belongs to different organization', () => {
      it('Then throws "Share request does not belong to this organization" error', async () => {
        const request = aShareRequest().withStatus('pending').build();
        const differentOrgId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              issueId: request.issueId,
              status: 'pending',
              issueOrgId: differentOrgId,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.approveShareRequest(request.id, reviewerId, organizationId)
        ).rejects.toThrow('Share request does not belong to this organization');
      });
    });

    describe('Given share request already processed', () => {
      it('Then throws "Share request has already been processed" error', async () => {
        const request = aShareRequest().withStatus('approved').build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              issueId: request.issueId,
              status: 'approved',
              issueOrgId: organizationId,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.approveShareRequest(request.id, reviewerId, organizationId)
        ).rejects.toThrow('Share request has already been processed');
      });
    });
  });

  describe('rejectShareRequest', () => {
    const reviewerId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    describe('Given share request does not exist', () => {
      it('Then throws "Share request not found" error', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.rejectShareRequest(
            crypto.randomUUID(),
            reviewerId,
            { reason: 'Not appropriate' },
            organizationId
          )
        ).rejects.toThrow('Share request not found');
      });
    });

    describe('Given share request belongs to different organization', () => {
      it('Then throws "Share request does not belong to this organization" error', async () => {
        const request = aShareRequest().withStatus('pending').build();
        const differentOrgId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              status: 'pending',
              issueOrgId: differentOrgId,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.rejectShareRequest(
            request.id,
            reviewerId,
            { reason: 'Not appropriate' },
            organizationId
          )
        ).rejects.toThrow('Share request does not belong to this organization');
      });
    });

    describe('Given share request already processed', () => {
      it('Then throws "Share request has already been processed" error', async () => {
        const request = aShareRequest().withStatus('rejected').build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              status: 'rejected',
              issueOrgId: organizationId,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.rejectShareRequest(
            request.id,
            reviewerId,
            { reason: 'Not appropriate' },
            organizationId
          )
        ).rejects.toThrow('Share request has already been processed');
      });
    });

    describe('Given valid pending share request', () => {
      it('Then updates request status to rejected with reason', async () => {
        const request = aShareRequest().withStatus('pending').build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              status: 'pending',
              issueOrgId: organizationId,
            },
          ])
          .mockResult(undefined)
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        await service.rejectShareRequest(
          request.id,
          reviewerId,
          { reason: 'Content not suitable' },
          organizationId
        );

        expect(mockDb.update).toHaveBeenCalled();
      });
    });
  });

  describe('getSharedContentByIssue', () => {
    describe('Given shared content does not exist', () => {
      it('Then returns null', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.getSharedContentByIssue(crypto.randomUUID());

        expect(result).toBeNull();
      });
    });

    describe('Given shared content exists', () => {
      it('Then returns origin info without originIssueId', async () => {
        const originOrg = anOrganization().withName('Origin Org').build();
        const issueId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              originOrganizationId: originOrg.id,
              originOrganizationName: originOrg.name,
              sharedAt: new Date(),
              revokedAt: null,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));
        const result = await service.getSharedContentByIssue(issueId);

        expect(result).not.toBeNull();
        expect(result?.originOrganizationId).toBe(originOrg.id);
        expect(result?.originOrganizationName).toBe(originOrg.name);
      });
    });
  });

  describe('revokeShareRequest', () => {
    const reviewerId = crypto.randomUUID();
    const organizationId = crypto.randomUUID();

    describe('Given share request does not exist', () => {
      it('Then throws "Share request not found" error', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.revokeShareRequest(crypto.randomUUID(), reviewerId, organizationId)
        ).rejects.toThrow('Share request not found');
      });
    });

    describe('Given share request is not approved', () => {
      it('Then throws "Only approved share requests can be revoked" error', async () => {
        const request = aShareRequest().withStatus('pending').build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              issueId: request.issueId,
              status: 'pending',
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.revokeShareRequest(request.id, reviewerId, organizationId)
        ).rejects.toThrow('Only approved share requests can be revoked');
      });
    });

    describe('Given no active shared content found', () => {
      it('Then throws "Active shared content not found" error', async () => {
        const request = aShareRequest().withStatus('approved').build();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              issueId: request.issueId,
              status: 'approved',
            },
          ])
          .mockResult([])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.revokeShareRequest(request.id, reviewerId, organizationId)
        ).rejects.toThrow('Active shared content not found for this request');
      });
    });

    describe('Given shared content belongs to different organization', () => {
      it('Then throws "does not belong to this organization" error', async () => {
        const request = aShareRequest().withStatus('approved').build();
        const differentOrgId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: request.id,
              issueId: request.issueId,
              status: 'approved',
            },
          ])
          .mockResult([
            {
              id: crypto.randomUUID(),
              originOrganizationId: differentOrgId,
              shareRequestId: request.id,
              revokedAt: null,
            },
          ])
          .build();

        const service = new ShareRequestService(createMockDeps(mockDb));

        await expect(
          service.revokeShareRequest(request.id, reviewerId, organizationId)
        ).rejects.toThrow('Share request does not belong to this organization');
      });
    });
  });
});
