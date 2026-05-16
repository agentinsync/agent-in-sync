import { describe, it, expect } from 'vitest';
import { OrganizationService } from './organization.service.js';
import { createMockDb, createMockDeps, MockDbBuilder } from '../test-utils/mocks.js';
import { anOrganization, aUser, anOrganizationMember } from '../test-utils/builders.js';

describe('OrganizationService', () => {
  describe('createOrganization', () => {
    describe('Given valid organization input', () => {
      describe('When owner creates an organization', () => {
        it('Then creates organization and adds owner as admin', async () => {
          const ownerId = crypto.randomUUID();
          const newOrg = anOrganization().withName('My Org').withSlug('my-org').build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ tier: 'paid' }]) // getUserTier query
            .mockResult([newOrg]) // insert org returning
            .mockResult([]) // insert membership returning
            .build();

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.createOrganization(
            { name: 'My Org', slug: 'my-org' },
            ownerId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.id).toBe(newOrg.id);
          expect(result.name).toBe('My Org');
          expect(result.slug).toBe('my-org');
          expect(result.isPublic).toBe(false);
        });
      });
    });
  });

  describe('getOrganization', () => {
    describe('Given organization exists', () => {
      describe('When fetching organization by id', () => {
        it('Then returns the organization', async () => {
          const mockDb = createMockDb();
          const org = anOrganization().withName('Test Org').build();

          mockDb.limit.mockResolvedValue([org]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getOrganization(org.id);

          expect(result).not.toBeNull();
          expect(result?.id).toBe(org.id);
          expect(result?.name).toBe('Test Org');
        });
      });
    });

    describe('Given organization does not exist', () => {
      describe('When fetching organization by id', () => {
        it('Then returns null', async () => {
          const mockDb = createMockDb();
          mockDb.limit.mockResolvedValue([]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getOrganization(crypto.randomUUID());

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('getPublicOrganization', () => {
    describe('Given a public organization exists', () => {
      describe('When fetching public organization', () => {
        it('Then returns the public organization', async () => {
          const mockDb = createMockDb();
          const publicOrg = anOrganization()
            .withName('Public')
            .withSlug('public')
            .asPublic()
            .build();

          mockDb.limit.mockResolvedValue([publicOrg]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getPublicOrganization();

          expect(result).not.toBeNull();
          expect(result?.isPublic).toBe(true);
        });
      });
    });

    describe('Given no public organization exists', () => {
      describe('When fetching public organization', () => {
        it('Then returns null', async () => {
          const mockDb = createMockDb();
          mockDb.limit.mockResolvedValue([]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getPublicOrganization();

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('ensurePublicOrganization', () => {
    describe('Given public organization already exists', () => {
      describe('When ensuring public organization', () => {
        it('Then returns existing public organization', async () => {
          const mockDb = createMockDb();
          const publicOrg = anOrganization()
            .withName('Public')
            .withSlug('public')
            .asPublic()
            .build();

          mockDb.limit.mockResolvedValue([publicOrg]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.ensurePublicOrganization();

          expect(result.id).toBe(publicOrg.id);
          expect(result.isPublic).toBe(true);
        });
      });
    });

    describe('Given no public organization exists', () => {
      describe('When ensuring public organization', () => {
        it('Then creates and returns new public organization', async () => {
          const mockDb = createMockDb();
          const newPublicOrg = anOrganization()
            .withName('Public')
            .withSlug('public')
            .asPublic()
            .build();

          mockDb.limit.mockResolvedValue([]);
          mockDb.returning.mockResolvedValue([newPublicOrg]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.ensurePublicOrganization();

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.isPublic).toBe(true);
        });
      });
    });
  });

  describe('getUserOrganizations', () => {
    describe('Given user belongs to multiple organizations', () => {
      describe('When fetching user organizations', () => {
        it('Then returns all organizations with roles', async () => {
          const mockDb = createMockDb();
          const userId = crypto.randomUUID();
          const org1 = anOrganization().withName('Org 1').build();
          const org2 = anOrganization().withName('Org 2').build();

          mockDb.where.mockResolvedValue([
            { ...org1, role: 'admin' },
            { ...org2, role: 'member' },
          ]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getUserOrganizations(userId);

          expect(result).toHaveLength(2);
          expect(result[0]?.role).toBe('admin');
          expect(result[1]?.role).toBe('member');
        });
      });
    });

    describe('Given user belongs to no organizations', () => {
      describe('When fetching user organizations', () => {
        it('Then returns empty array', async () => {
          const mockDb = createMockDb();
          const userId = crypto.randomUUID();

          mockDb.where.mockResolvedValue([]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getUserOrganizations(userId);

          expect(result).toHaveLength(0);
        });
      });
    });
  });

  describe('addMember', () => {
    describe('Given valid user to add', () => {
      describe('When adding member to organization', () => {
        it('Then creates membership and returns member info', async () => {
          const mockDb = createMockDb();
          const organizationId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const membership = anOrganizationMember()
            .withOrganizationId(organizationId)
            .withUserId(userId)
            .withRole('member')
            .build();
          const user = aUser().withId(userId).withEmail('user@example.com').build();

          mockDb.returning.mockResolvedValue([membership]);
          mockDb.limit.mockResolvedValue([{ name: user.name, email: user.email }]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.addMember(organizationId, { userId, role: 'member' });

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.userId).toBe(userId);
          expect(result.role).toBe('member');
        });
      });
    });
  });

  describe('updateMemberRole', () => {
    describe('Given member exists in organization', () => {
      describe('When updating member role to admin', () => {
        it('Then updates the role', async () => {
          const mockDb = createMockDb();
          const organizationId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          mockDb.where.mockResolvedValue(undefined);

          const service = new OrganizationService(createMockDeps(mockDb));
          await service.updateMemberRole(organizationId, userId, 'admin');

          expect(mockDb.update).toHaveBeenCalled();
        });
      });

      describe('When updating member role to reviewer', () => {
        it('Then updates the role', async () => {
          const mockDb = createMockDb();
          const organizationId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          mockDb.where.mockResolvedValue(undefined);

          const service = new OrganizationService(createMockDeps(mockDb));
          await service.updateMemberRole(organizationId, userId, 'reviewer');

          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });
  });

  describe('removeMember', () => {
    describe('Given member exists in organization', () => {
      describe('When removing member', () => {
        it('Then deletes the membership', async () => {
          const mockDb = createMockDb();
          const organizationId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          mockDb.where.mockResolvedValue(undefined);

          const service = new OrganizationService(createMockDeps(mockDb));
          await service.removeMember(organizationId, userId);

          expect(mockDb.delete).toHaveBeenCalled();
        });
      });
    });
  });

  describe('ensureDeletedOrganization', () => {
    describe('Given deleted organization sentinel already exists', () => {
      describe('When ensuring deleted organization', () => {
        it('Then returns existing sentinel organization', async () => {
          const mockDb = createMockDb();
          const deletedOrg = anOrganization()
            .withId('00000000-0000-0000-0000-000000000001')
            .withName('[Deleted Organization]')
            .withSlug('_deleted')
            .build();

          mockDb.limit.mockResolvedValue([deletedOrg]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.ensureDeletedOrganization();

          expect(result.id).toBe('00000000-0000-0000-0000-000000000001');
          expect(result.name).toBe('[Deleted Organization]');
        });
      });
    });

    describe('Given deleted organization sentinel does not exist', () => {
      describe('When ensuring deleted organization', () => {
        it('Then creates and returns new sentinel organization', async () => {
          const deletedOrg = anOrganization()
            .withId('00000000-0000-0000-0000-000000000001')
            .withName('[Deleted Organization]')
            .withSlug('_deleted')
            .build();

          const mockDb = new MockDbBuilder()
            .mockResult([]) // select existing - empty
            .mockResult([deletedOrg]) // insert returning
            .build();

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.ensureDeletedOrganization();

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.id).toBe('00000000-0000-0000-0000-000000000001');
          expect(result.name).toBe('[Deleted Organization]');
        });
      });
    });
  });

  describe('deleteOrganizationWithContentPreservation', () => {
    describe('Given organization has content', () => {
      describe('When deleting organization with content preservation', () => {
        it('Then reassigns content to sentinel and deletes org', async () => {
          const organizationId = crypto.randomUUID();
          const deletedOrg = anOrganization()
            .withId('00000000-0000-0000-0000-000000000001')
            .withName('[Deleted Organization]')
            .withSlug('_deleted')
            .build();

          const mockDb = new MockDbBuilder()
            .mockResult([deletedOrg]) // ensureDeletedOrganization select
            .mockResult(undefined) // update issues
            .mockResult(undefined) // update agents
            .mockResult(undefined) // update badgeNominations
            .mockResult(undefined) // update sharedContent
            .mockResult(undefined) // delete organization
            .build();

          const service = new OrganizationService(createMockDeps(mockDb));
          await service.deleteOrganizationWithContentPreservation(organizationId);

          expect(mockDb.update).toHaveBeenCalled();
          expect(mockDb.delete).toHaveBeenCalled();
        });
      });
    });

    describe('Given organization has no content', () => {
      describe('When deleting organization with content preservation', () => {
        it('Then still deletes the organization', async () => {
          const organizationId = crypto.randomUUID();
          const deletedOrg = anOrganization()
            .withId('00000000-0000-0000-0000-000000000001')
            .withName('[Deleted Organization]')
            .withSlug('_deleted')
            .build();

          const mockDb = new MockDbBuilder()
            .mockResult([deletedOrg]) // ensureDeletedOrganization select
            .mockResult(undefined) // update issues (no rows affected)
            .mockResult(undefined) // update agents (no rows affected)
            .mockResult(undefined) // update badgeNominations (no rows affected)
            .mockResult(undefined) // update sharedContent (no rows affected)
            .mockResult(undefined) // delete organization
            .build();

          const service = new OrganizationService(createMockDeps(mockDb));
          await service.deleteOrganizationWithContentPreservation(organizationId);

          expect(mockDb.delete).toHaveBeenCalled();
        });
      });
    });
  });

  describe('getOrganizationMembers', () => {
    describe('Given organization has members', () => {
      describe('When fetching organization members', () => {
        it('Then returns all members with their info', async () => {
          const mockDb = createMockDb();
          const organizationId = crypto.randomUUID();
          const member1 = anOrganizationMember()
            .withOrganizationId(organizationId)
            .withRole('admin')
            .build();
          const member2 = anOrganizationMember()
            .withOrganizationId(organizationId)
            .withRole('member')
            .build();
          const user1 = aUser().withId(member1.userId).withEmail('admin@example.com').build();
          const user2 = aUser().withId(member2.userId).withEmail('member@example.com').build();

          mockDb.where.mockResolvedValue([
            {
              id: member1.id,
              userId: member1.userId,
              userName: user1.name,
              userEmail: user1.email,
              role: 'admin',
              createdAt: member1.createdAt,
            },
            {
              id: member2.id,
              userId: member2.userId,
              userName: user2.name,
              userEmail: user2.email,
              role: 'member',
              createdAt: member2.createdAt,
            },
          ]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getOrganizationMembers(organizationId);

          expect(result).toHaveLength(2);
          expect(result[0]?.role).toBe('admin');
          expect(result[1]?.role).toBe('member');
        });
      });
    });

    describe('Given organization has no members', () => {
      describe('When fetching organization members', () => {
        it('Then returns empty array', async () => {
          const mockDb = createMockDb();
          const organizationId = crypto.randomUUID();

          mockDb.where.mockResolvedValue([]);

          const service = new OrganizationService(createMockDeps(mockDb));
          const result = await service.getOrganizationMembers(organizationId);

          expect(result).toHaveLength(0);
        });
      });
    });
  });
});
