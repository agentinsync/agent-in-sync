import { describe, it, expect } from 'vitest';
import { PrivacyService, DELETED_USER_ID } from './privacy.service.js';
import { createMockDb, createMockDeps, MockDbBuilder } from '../test-utils/mocks.js';

describe('PrivacyService', () => {
  const userId = crypto.randomUUID();

  describe('hasCurrentConsent', () => {
    describe('Given user has current consent versions', () => {
      it('Then returns true', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([{ tosVersion: '1.0', privacyPolicyVersion: '1.0' }])
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.hasCurrentConsent(userId);

        expect(result).toBe(true);
      });
    });

    describe('Given user has outdated consent versions', () => {
      it('Then returns false', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([{ tosVersion: '0.9', privacyPolicyVersion: '0.9' }])
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.hasCurrentConsent(userId);

        expect(result).toBe(false);
      });
    });

    describe('Given user has no consent recorded', () => {
      it('Then returns false', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([{ tosVersion: null, privacyPolicyVersion: null }])
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.hasCurrentConsent(userId);

        expect(result).toBe(false);
      });
    });

    describe('Given user does not exist', () => {
      it('Then returns false', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.hasCurrentConsent(userId);

        expect(result).toBe(false);
      });
    });
  });

  describe('recordConsent', () => {
    describe('Given valid consent input', () => {
      it('Then calls transaction with update and insert', async () => {
        const mockDb = createMockDb();

        const service = new PrivacyService(createMockDeps(mockDb));
        await service.recordConsent(
          userId,
          { tosVersion: '1.0', privacyPolicyVersion: '1.0' },
          '127.0.0.1',
          'test-agent'
        );

        expect(mockDb.transaction).toHaveBeenCalled();
      });
    });
  });

  describe('requestDeletion', () => {
    describe('Given no pending deletion request', () => {
      it('Then creates a new deletion request and returns token', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([]) // no existing pending request
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.requestDeletion(userId);

        expect(result.token).toBeDefined();
        expect(result.token.length).toBeGreaterThan(0);
        expect(result.expiresAt).toBeInstanceOf(Date);
        expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(mockDb.insert).toHaveBeenCalled();
      });
    });

    describe('Given a pending deletion request already exists', () => {
      it('Then throws DELETION_ALREADY_REQUESTED', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([{ id: crypto.randomUUID() }]) // existing pending request
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));

        await expect(service.requestDeletion(userId)).rejects.toThrow('DELETION_ALREADY_REQUESTED');
      });
    });
  });

  describe('cancelDeletion', () => {
    describe('Given a pending deletion request exists', () => {
      it('Then updates status to cancelled', async () => {
        const requestId = crypto.randomUUID();
        const mockDb = new MockDbBuilder().mockResult([{ id: requestId }]).build();

        const service = new PrivacyService(createMockDeps(mockDb));
        await service.cancelDeletion(userId);

        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ status: 'cancelled' });
      });
    });

    describe('Given no pending deletion request', () => {
      it('Then throws NO_PENDING_DELETION', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new PrivacyService(createMockDeps(mockDb));

        await expect(service.cancelDeletion(userId)).rejects.toThrow('NO_PENDING_DELETION');
      });
    });
  });

  describe('getDeletionStatus', () => {
    describe('Given a pending deletion request', () => {
      it('Then returns hasPending true with expiresAt', async () => {
        const expiresAt = new Date('2026-03-01');
        const mockDb = new MockDbBuilder().mockResult([{ expiresAt }]).build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.getDeletionStatus(userId);

        expect(result.hasPending).toBe(true);
        expect(result.expiresAt).toEqual(expiresAt);
      });
    });

    describe('Given no pending deletion request', () => {
      it('Then returns hasPending false', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.getDeletionStatus(userId);

        expect(result.hasPending).toBe(false);
        expect(result.expiresAt).toBeNull();
      });
    });
  });

  describe('confirmDeletion', () => {
    describe('Given invalid token', () => {
      it('Then throws INVALID_DELETION_TOKEN', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new PrivacyService(createMockDeps(mockDb));

        await expect(service.confirmDeletion(userId, 'bad-token')).rejects.toThrow(
          'INVALID_DELETION_TOKEN'
        );
      });
    });

    describe('Given expired token', () => {
      it('Then throws DELETION_TOKEN_EXPIRED', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: crypto.randomUUID(),
              expiresAt: new Date('2020-01-01'),
            },
          ])
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));

        await expect(service.confirmDeletion(userId, 'some-token')).rejects.toThrow(
          'DELETION_TOKEN_EXPIRED'
        );
      });
    });

    describe('Given valid token', () => {
      it('Then calls transaction to anonymize the account', async () => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 7);

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: crypto.randomUUID(),
              expiresAt: futureDate,
            },
          ])
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));
        await service.confirmDeletion(userId, 'valid-token');

        expect(mockDb.transaction).toHaveBeenCalled();
      });
    });
  });

  describe('exportUserData', () => {
    describe('Given user does not exist', () => {
      it('Then throws USER_NOT_FOUND', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new PrivacyService(createMockDeps(mockDb));

        await expect(service.exportUserData(userId)).rejects.toThrow('USER_NOT_FOUND');
      });
    });

    describe('Given user exists', () => {
      it('Then returns structured export data', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: userId,
              email: 'test@example.com',
              name: 'Test User',
              tier: 'free',
              reputationScore: 0,
              reputationLevel: 'newcomer',
              totalAcceptedSolutions: 0,
              totalUpvotesReceived: 0,
              totalContributions: 0,
              tosVersion: '1.0',
              tosAcceptedAt: new Date(),
              privacyPolicyVersion: '1.0',
              privacyPolicyAcceptedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ])
          // Subsequent queries for org members, api keys, issues, solutions, comments, votes, agents, consent events
          .mockResult([])
          .mockResult([])
          .mockResult([])
          .mockResult([])
          .mockResult([])
          .mockResult([])
          .mockResult([])
          .mockResult([])
          .build();

        const service = new PrivacyService(createMockDeps(mockDb));
        const result = await service.exportUserData(userId);

        expect(result.exportedAt).toBeDefined();
        expect(result.user).toBeDefined();
        expect((result.user as Record<string, unknown>).email).toBe('test@example.com');
        expect(result.organizationMemberships).toEqual([]);
        expect(result.apiKeys).toEqual([]);
        expect(result.issues).toEqual([]);
        expect(result.solutions).toEqual([]);
        expect(result.comments).toEqual([]);
        expect(result.votes).toEqual([]);
        expect(result.agents).toEqual([]);
        expect(result.consentEvents).toEqual([]);
      });
    });
  });

  describe('DELETED_USER_ID', () => {
    it('is a valid UUID sentinel', () => {
      expect(DELETED_USER_ID).toBe('00000000-0000-0000-0000-000000000000');
    });
  });
});
