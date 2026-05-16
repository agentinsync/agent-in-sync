import { describe, it, expect } from 'vitest';
import { SuperAdminService } from './super-admin.service.js';
import { createMockDeps, MockDbBuilder } from '../test-utils/mocks.js';

// The dashboard stats cache is module-level, so we need to invalidate it between tests
// by waiting for expiry or by using a fresh service. We set the cache TTL to 60s in source.
// Since tests are fast, the cache populated in one test may affect the next — each test
// uses its own service instance which will still hit the shared cache. To work around
// this, each dashboard test should be self-contained and run in its own describe block.

describe('SuperAdminService', () => {
  describe('getUsers', () => {
    describe('Given users exist in the database', () => {
      describe('When fetching users with default pagination', () => {
        it('Then returns paginated user list with orgCount', async () => {
          // Given
          const user1 = {
            id: crypto.randomUUID(),
            email: 'alice@example.com',
            name: 'Alice',
            tier: 'free',
            isSuperAdmin: false,
            reputationLevel: 'newcomer',
            reputationScore: 10,
            totalContributions: 5,
            createdAt: new Date(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult([user1]) // select users (via limit+offset)
            .mockResult([{ count: 1 }]) // count users
            .mockResult([{ userId: user1.id, count: 2 }]) // org counts groupBy
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getUsers({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(1);
          expect(result.total).toBe(1);
          expect(result.page).toBe(0);
          expect(result.totalPages).toBe(1);
          const firstItem = result.items[0] as Record<string, unknown>;
          expect(firstItem.email).toBe('alice@example.com');
          expect(firstItem.orgCount).toBe(2);
        });
      });
    });

    describe('Given no users match the search', () => {
      describe('When fetching users with a search term', () => {
        it('Then returns empty items with correct pagination', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult([]) // select users — empty
            .mockResult([{ count: 0 }]) // count users
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getUsers({ page: 0, limit: 20, search: 'nonexistent' });

          // Then
          expect(result.items).toHaveLength(0);
          expect(result.total).toBe(0);
          expect(result.totalPages).toBe(0);
        });
      });
    });
  });

  describe('getUserDetail', () => {
    describe('Given user exists', () => {
      describe('When fetching user by id', () => {
        it('Then returns user with memberships and API keys', async () => {
          // Given
          const userId = crypto.randomUUID();
          const orgId = crypto.randomUUID();
          const user = {
            id: userId,
            email: 'bob@example.com',
            name: 'Bob',
            image: null,
            tier: 'paid',
            isSuperAdmin: true,
            reputationLevel: 'expert',
            reputationScore: 500,
            totalAcceptedSolutions: 10,
            totalUpvotesReceived: 50,
            totalContributions: 100,
            createdAt: new Date(),
          };
          const membership = {
            organizationId: orgId,
            organizationName: 'Acme Corp',
            organizationSlug: 'acme',
            role: 'admin',
            joinedAt: new Date(),
          };
          const apiKey = {
            id: crypto.randomUUID(),
            name: 'Test Key',
            keyPrefix: 'ask_abc',
            trustLevel: 'established',
            trustScore: 80,
            lastUsedAt: null,
            issuesCreated: 5,
            solutionsCreated: 3,
            createdAt: new Date(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult([user]) // select user (via limit)
            .mockResult([membership]) // select memberships (via where)
            .mockResult([apiKey]) // select api keys (via where)
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getUserDetail(userId);

          // Then
          expect(result).not.toBeNull();
          expect(result!.email).toBe('bob@example.com');
          expect(result!.isSuperAdmin).toBe(true);
          expect(result!.memberships).toHaveLength(1);
          expect(result!.memberships[0]!.organizationName).toBe('Acme Corp');
          expect(result!.apiKeys).toHaveLength(1);
          expect(result!.apiKeys[0]!.name).toBe('Test Key');
        });
      });
    });

    describe('Given user does not exist', () => {
      describe('When fetching user by id', () => {
        it('Then returns null', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult([]) // select user — empty
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getUserDetail(crypto.randomUUID());

          // Then
          expect(result).toBeNull();
        });
      });
    });
  });

  describe('updateUser', () => {
    describe('Given valid update data', () => {
      describe('When toggling super-admin flag', () => {
        it('Then calls update and writes audit log', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult(undefined) // update users
            .mockResult(undefined) // insert audit log
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          await service.updateUser(
            crypto.randomUUID(),
            { isSuperAdmin: true },
            crypto.randomUUID()
          );

          // Then
          expect(mockDb.update).toHaveBeenCalled();
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });

    describe('Given empty update data', () => {
      describe('When updating user with no fields', () => {
        it('Then does nothing', async () => {
          // Given
          const mockDb = new MockDbBuilder().build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          await service.updateUser(crypto.randomUUID(), {}, crypto.randomUUID());

          // Then
          expect(mockDb.update).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('getOrganizations', () => {
    describe('Given organizations exist', () => {
      describe('When fetching with default pagination', () => {
        it('Then returns paginated org list with counts', async () => {
          // Given
          const orgId = crypto.randomUUID();
          const org = {
            id: orgId,
            name: 'Acme',
            slug: 'acme',
            isPublic: false,
            domainId: null,
            createdAt: new Date(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult([org]) // select orgs (via limit+offset)
            .mockResult([{ count: 1 }]) // count orgs
            .mockResult([{ orgId, count: 5 }]) // member counts groupBy
            .mockResult([{ orgId, count: 10 }]) // issue counts groupBy
            .mockResult([{ orgId, count: 3 }]) // solution counts groupBy
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getOrganizations({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(1);
          expect(result.total).toBe(1);
          const firstOrg = result.items[0] as Record<string, unknown>;
          expect(firstOrg.name).toBe('Acme');
          expect(firstOrg.memberCount).toBe(5);
          expect(firstOrg.issueCount).toBe(10);
          expect(firstOrg.solutionCount).toBe(3);
        });
      });
    });

    describe('Given no organizations match', () => {
      describe('When searching with a term', () => {
        it('Then returns empty result', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult([]) // select orgs — empty
            .mockResult([{ count: 0 }]) // count orgs
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getOrganizations({
            page: 0,
            limit: 20,
            search: 'nonexistent',
          });

          // Then
          expect(result.items).toHaveLength(0);
          expect(result.total).toBe(0);
        });
      });
    });
  });

  describe('getOrganizationDetail', () => {
    describe('Given organization exists', () => {
      describe('When fetching by id', () => {
        it('Then returns org with counts and members', async () => {
          // Given
          const orgId = crypto.randomUUID();
          const org = {
            id: orgId,
            name: 'Test Org',
            slug: 'test-org',
            isPublic: true,
            domainId: null,
            createdAt: new Date(),
          };
          const member = {
            userId: crypto.randomUUID(),
            userName: 'Alice',
            userEmail: 'alice@test.com',
            role: 'admin',
            joinedAt: new Date(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult([org]) // select org (via limit)
            .mockResult([{ count: 3 }]) // member count
            .mockResult([{ count: 10 }]) // issue count
            .mockResult([{ count: 5 }]) // solution count
            .mockResult([{ count: 1 }]) // agent count
            .mockResult([member]) // select members (via limit)
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getOrganizationDetail(orgId);

          // Then
          expect(result).not.toBeNull();
          expect(result!.name).toBe('Test Org');
          expect(result!.memberCount).toBe(3);
          expect(result!.issueCount).toBe(10);
          expect(result!.solutionCount).toBe(5);
          expect(result!.agentCount).toBe(1);
          expect(result!.members).toHaveLength(1);
          expect(result!.members[0]!.userName).toBe('Alice');
        });
      });
    });

    describe('Given organization does not exist', () => {
      describe('When fetching by id', () => {
        it('Then returns null', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult([]) // select org — empty
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getOrganizationDetail(crypto.randomUUID());

          // Then
          expect(result).toBeNull();
        });
      });
    });
  });

  describe('getFlags', () => {
    describe('Given pending flags exist', () => {
      describe('When fetching with pending status filter', () => {
        it('Then returns paginated flags', async () => {
          // Given
          const flag = {
            id: crypto.randomUUID(),
            contentType: 'issue',
            contentId: crypto.randomUUID(),
            reporterId: crypto.randomUUID(),
            reason: 'spam',
            details: 'Obvious spam content',
            createdAt: new Date(),
            resolvedAt: null,
            resolvedBy: null,
            resolution: null,
          };

          const mockDb = new MockDbBuilder()
            .mockResult([flag]) // select flags (via limit+offset)
            .mockResult([{ count: 1 }]) // count flags
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getFlags({ page: 0, limit: 20, status: 'pending' });

          // Then
          expect(result.items).toHaveLength(1);
          expect(result.total).toBe(1);
          const firstFlag = result.items[0] as Record<string, unknown>;
          expect(firstFlag.reason).toBe('spam');
          expect(firstFlag.resolvedAt).toBeNull();
        });
      });
    });

    describe('Given no flags exist', () => {
      describe('When fetching flags', () => {
        it('Then returns empty result', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult([]) // select flags — empty
            .mockResult([{ count: 0 }]) // count flags
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getFlags({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(0);
          expect(result.total).toBe(0);
        });
      });
    });
  });

  describe('resolveFlag', () => {
    describe('Given a pending flag', () => {
      describe('When resolving as dismissed', () => {
        it('Then updates the flag and writes audit log', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult(undefined) // update contentFlags
            .mockResult(undefined) // insert audit log
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          await service.resolveFlag(crypto.randomUUID(), 'dismissed', crypto.randomUUID());

          // Then
          expect(mockDb.update).toHaveBeenCalled();
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });
  });

  describe('getAgents', () => {
    describe('Given agents exist', () => {
      describe('When fetching with default pagination', () => {
        it('Then returns paginated agent list with org names', async () => {
          // Given
          const orgId = crypto.randomUUID();
          const agent = {
            id: crypto.randomUUID(),
            slug: 'cursor-agent',
            displayName: 'Cursor',
            organizationId: orgId,
            badgeCount: 2,
            connectedUserId: null,
            isPublic: true,
            createdAt: new Date(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult([agent]) // select agents (via limit+offset)
            .mockResult([{ count: 1 }]) // count agents
            .mockResult([{ id: orgId, name: 'Acme Corp' }]) // org name lookup
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getAgents({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(1);
          const firstAgent = result.items[0] as Record<string, unknown>;
          expect(firstAgent.displayName).toBe('Cursor');
          expect(firstAgent.organizationName).toBe('Acme Corp');
          expect(firstAgent.badgeCount).toBe(2);
        });
      });
    });
  });

  describe('getDomains', () => {
    describe('Given domains exist', () => {
      describe('When fetching with default pagination', () => {
        it('Then returns paginated domain list with member counts', async () => {
          // Given
          const domainId = crypto.randomUUID();
          const domain = {
            id: domainId,
            name: 'acme.com',
            status: 'verified',
            ssoEnabled: true,
            domainAdminId: crypto.randomUUID(),
            verifiedAt: new Date(),
            createdAt: new Date(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult([domain]) // select domains (via limit+offset)
            .mockResult([{ count: 1 }]) // count domains
            .mockResult([{ domainId, count: 8 }]) // member counts groupBy
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getDomains({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(1);
          const firstDomain = result.items[0] as Record<string, unknown>;
          expect(firstDomain.name).toBe('acme.com');
          expect(firstDomain.memberCount).toBe(8);
          expect(firstDomain.ssoEnabled).toBe(true);
        });
      });
    });
  });

  describe('updateDomain', () => {
    describe('Given a pending domain', () => {
      describe('When force-verifying', () => {
        it('Then sets status to verified and writes audit', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult(undefined) // update domains
            .mockResult(undefined) // insert audit log
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          await service.updateDomain(
            crypto.randomUUID(),
            { status: 'verified' },
            crypto.randomUUID()
          );

          // Then
          expect(mockDb.update).toHaveBeenCalled();
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });

    describe('Given a verified domain', () => {
      describe('When revoking verification', () => {
        it('Then sets status to pending and writes audit', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult(undefined) // update domains
            .mockResult(undefined) // insert audit log
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          await service.updateDomain(
            crypto.randomUUID(),
            { status: 'pending' },
            crypto.randomUUID()
          );

          // Then
          expect(mockDb.update).toHaveBeenCalled();
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });
  });

  describe('getAuditLog', () => {
    describe('Given audit entries exist', () => {
      describe('When fetching with default pagination', () => {
        it('Then returns entries with actor info', async () => {
          // Given
          const actorId = crypto.randomUUID();
          const entry = {
            id: crypto.randomUUID(),
            actorId,
            action: 'user.updated',
            targetType: 'user',
            targetId: crypto.randomUUID(),
            metadata: { isSuperAdmin: true },
            createdAt: new Date(),
          };
          const actor = { id: actorId, name: 'Admin User', email: 'admin@example.com' };

          const mockDb = new MockDbBuilder()
            .mockResult([entry]) // select audit_log (via limit+offset)
            .mockResult([{ count: 1 }]) // count audit_log
            .mockResult([actor]) // select actors
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getAuditLog({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(1);
          const firstEntry = result.items[0]!;
          expect(firstEntry.action).toBe('user.updated');
          expect(firstEntry.actorName).toBe('Admin User');
          expect(firstEntry.actorEmail).toBe('admin@example.com');
        });
      });
    });

    describe('Given no audit entries exist', () => {
      describe('When fetching audit log', () => {
        it('Then returns empty result', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult([]) // select audit_log — empty
            .mockResult([{ count: 0 }]) // count audit_log
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          const result = await service.getAuditLog({ page: 0, limit: 20 });

          // Then
          expect(result.items).toHaveLength(0);
          expect(result.total).toBe(0);
          expect(result.totalPages).toBe(0);
        });
      });
    });
  });

  describe('updateOrganization', () => {
    describe('Given valid update data', () => {
      describe('When toggling public flag', () => {
        it('Then calls update and writes audit log', async () => {
          // Given
          const mockDb = new MockDbBuilder()
            .mockResult(undefined) // update organizations
            .mockResult(undefined) // insert audit log
            .build();

          // When
          const service = new SuperAdminService(createMockDeps(mockDb));
          await service.updateOrganization(
            crypto.randomUUID(),
            { isPublic: true },
            crypto.randomUUID()
          );

          // Then
          expect(mockDb.update).toHaveBeenCalled();
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });
  });
});
