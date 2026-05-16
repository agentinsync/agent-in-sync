import { describe, it, expect } from 'vitest';
import { DomainService } from './domain.service.js';
import { createMockDb, createMockDeps, MockDbBuilder } from '../test-utils/mocks.js';
import { aDomain, aDomainMember } from '../test-utils/builders.js';

describe('DomainService', () => {
  describe('findByName', () => {
    describe('Given domain exists', () => {
      describe('When finding by name', () => {
        it('Then returns the domain with member and org counts', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([aDomain().withName('acme.com').build()])
            .mockResult([{ count: 3 }])
            .mockResult([{ count: 2 }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.findByName('acme.com');

          expect(result).not.toBeNull();
          expect(result?.name).toBe('acme.com');
          expect(result?.memberCount).toBe(3);
          expect(result?.organizationCount).toBe(2);
        });
      });
    });

    describe('Given domain does not exist', () => {
      describe('When finding by name', () => {
        it('Then returns null', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.findByName('nonexistent.com');

          expect(result).toBeNull();
        });
      });
    });

    describe('Given domain name with uppercase letters', () => {
      describe('When finding by name', () => {
        it('Then normalizes to lowercase', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([aDomain().withName('acme.com').build()])
            .mockResult([{ count: 0 }])
            .mockResult([{ count: 0 }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          await service.findByName('ACME.COM');

          expect(mockDb.where).toHaveBeenCalled();
        });
      });
    });
  });

  describe('findOrCreateForUser', () => {
    describe('Given user with corporate email', () => {
      describe('When domain does not exist', () => {
        it('Then creates domain and adds user as admin', async () => {
          const userId = crypto.randomUUID();
          const newDomain = aDomain().withName('acme.com').withDomainAdminId(userId).build();

          const orgId = crypto.randomUUID();
          const mockDb = new MockDbBuilder()
            .mockResult([]) // findByName: no existing domain
            .mockResult([newDomain]) // domain tx: insert domains
            .mockResult([{ id: crypto.randomUUID() }]) // domain tx: insert domainMembers
            .mockResult(undefined) // domain tx: update users
            .mockResult([]) // generateUniqueSlug: no slug conflict
            .mockResult([{ id: orgId, name: 'Acme', slug: 'acme' }]) // createDefaultOrg tx: insert organizations
            .mockResult(undefined) // createDefaultOrg tx: insert orgMembers
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.findOrCreateForUser('user@acme.com', userId);

          expect(result).not.toBeNull();
          expect(result?.name).toBe('acme.com');
          expect(result?.domainAdminId).toBe(userId);
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });

    describe('Given user with public email domain', () => {
      describe('When creating domain', () => {
        it('Then returns null without creating', async () => {
          const mockDb = createMockDb();
          const service = new DomainService(createMockDeps(mockDb));

          const result = await service.findOrCreateForUser('user@gmail.com', crypto.randomUUID());

          expect(result).toBeNull();
          expect(mockDb.insert).not.toHaveBeenCalled();
        });
      });
    });

    describe('Given user with existing domain', () => {
      describe('When finding or creating domain', () => {
        it('Then returns existing domain and adds user as member', async () => {
          const existingDomain = aDomain().withName('acme.com').asVerified().build();

          const mockDb = new MockDbBuilder()
            .mockResult([existingDomain]) // findByName
            .mockResult([{ count: 5 }]) // getMemberCount
            .mockResult([{ count: 1 }]) // getOrganizationCount
            .mockResult([]) // addMember: no existing membership
            .mockResult([aDomainMember().build()]) // addMember: insert domainMembers
            .mockResult(undefined) // addMember: update users
            .mockResult([{ name: 'Test', email: 'user@acme.com' }]) // addMember: select user
            .mockResult([{ status: 'verified' }]) // checkSocialProofVerification
            .mockResult([{ id: crypto.randomUUID() }]) // joinDefaultOrg: getDefaultOrgForDomain
            .mockResult([]) // joinDefaultOrg: no existing membership
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.findOrCreateForUser('newuser@acme.com', crypto.randomUUID());

          expect(result).not.toBeNull();
          expect(result?.name).toBe('acme.com');
          expect(result?.status).toBe('verified');
        });
      });
    });
  });

  describe('addMember', () => {
    describe('Given user is not a member', () => {
      describe('When adding member', () => {
        it('Then creates membership and returns member info', async () => {
          const domainId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const membership = aDomainMember().withDomainId(domainId).withUserId(userId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([])
            .mockResult([membership])
            .mockResult(undefined)
            .mockResult([{ name: 'Test User', email: 'test@acme.com' }])
            .mockResult([{ status: 'pending' }])
            .mockResult([{ count: 2 }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.addMember(domainId, userId);

          expect(result).not.toBeNull();
          expect(result?.domainId).toBe(domainId);
          expect(result?.userId).toBe(userId);
        });
      });
    });

    describe('Given user is already a member', () => {
      describe('When adding member', () => {
        it('Then returns null without creating duplicate', async () => {
          const domainId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          const mockDb = new MockDbBuilder()
            .mockResult([aDomainMember().withDomainId(domainId).withUserId(userId).build()])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.addMember(domainId, userId);

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('getMemberCount', () => {
    describe('Given domain has members', () => {
      describe('When getting member count', () => {
        it('Then returns the count', async () => {
          const mockDb = new MockDbBuilder().mockResult([{ count: 5 }]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.getMemberCount(crypto.randomUUID());

          expect(result).toBe(5);
        });
      });
    });

    describe('Given domain has no members', () => {
      describe('When getting member count', () => {
        it('Then returns zero', async () => {
          const mockDb = new MockDbBuilder().mockResult([{ count: 0 }]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.getMemberCount(crypto.randomUUID());

          expect(result).toBe(0);
        });
      });
    });
  });

  describe('canCreateOrganization', () => {
    describe('Given domain has less than 5 organizations', () => {
      describe('When checking if can create org', () => {
        it('Then returns true', async () => {
          const mockDb = new MockDbBuilder().mockResult([{ count: 3 }]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.canCreateOrganization(crypto.randomUUID());

          expect(result).toBe(true);
        });
      });
    });

    describe('Given domain has 5 organizations', () => {
      describe('When checking if can create org', () => {
        it('Then returns false', async () => {
          const mockDb = new MockDbBuilder().mockResult([{ count: 5 }]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.canCreateOrganization(crypto.randomUUID());

          expect(result).toBe(false);
        });
      });
    });

    describe('Given null domain id (public email user)', () => {
      describe('When checking if can create org', () => {
        it('Then returns true', async () => {
          const mockDb = createMockDb();
          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.canCreateOrganization(null);

          expect(result).toBe(true);
        });
      });
    });
  });

  describe('isDomainAdmin', () => {
    describe('Given user is domain admin', () => {
      describe('When checking admin status', () => {
        it('Then returns true', async () => {
          const userId = crypto.randomUUID();
          const mockDb = new MockDbBuilder().mockResult([{ domainAdminId: userId }]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.isDomainAdmin(crypto.randomUUID(), userId);

          expect(result).toBe(true);
        });
      });
    });

    describe('Given user is not domain admin', () => {
      describe('When checking admin status', () => {
        it('Then returns false', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ domainAdminId: crypto.randomUUID() }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.isDomainAdmin(crypto.randomUUID(), crypto.randomUUID());

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('checkSocialProofVerification', () => {
    describe('Given domain is already verified', () => {
      describe('When checking social proof', () => {
        it('Then returns true without re-verifying', async () => {
          const mockDb = new MockDbBuilder().mockResult([{ status: 'verified' }]).build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.checkSocialProofVerification(crypto.randomUUID());

          expect(result).toBe(true);
        });
      });
    });

    describe('Given domain has 3+ members', () => {
      describe('When checking social proof', () => {
        it('Then verifies domain and returns true', async () => {
          const domainId = crypto.randomUUID();
          const mockDb = new MockDbBuilder()
            .mockResult([{ status: 'pending' }])
            .mockResult([{ count: 3 }])
            .mockResult(undefined)
            .mockResult([{ name: 'acme.com', domainAdminId: crypto.randomUUID() }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.checkSocialProofVerification(domainId);

          expect(result).toBe(true);
          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given domain has less than 3 members', () => {
      describe('When checking social proof', () => {
        it('Then returns false without verifying', async () => {
          const mockDb = new MockDbBuilder()
            .mockResult([{ status: 'pending' }])
            .mockResult([{ count: 2 }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.checkSocialProofVerification(crypto.randomUUID());

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('updateSsoConfig', () => {
    describe('Given valid SSO config', () => {
      describe('When updating SSO config', () => {
        it('Then enables SSO and updates config', async () => {
          const domainId = crypto.randomUUID();
          const ssoConfig = {
            idpEntityId: 'https://idp.example.com',
            idpSsoUrl: 'https://idp.example.com/sso',
            idpCertificate: 'cert',
            spEntityId: 'https://app.example.com',
            spAcsUrl: 'https://app.example.com/acs',
            spMetadataUrl: 'https://app.example.com/metadata',
            attributeMapping: { email: 'email' },
            signRequests: true,
            wantAssertionsSigned: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const mockDb = new MockDbBuilder()
            .mockResult(undefined)
            .mockResult([{ status: 'pending' }])
            .mockResult(undefined)
            .mockResult([{ name: 'acme.com', domainAdminId: crypto.randomUUID() }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          await service.updateSsoConfig(domainId, ssoConfig);

          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given null SSO config', () => {
      describe('When updating SSO config', () => {
        it('Then disables SSO', async () => {
          const mockDb = new MockDbBuilder().mockResult(undefined).build();

          const service = new DomainService(createMockDeps(mockDb));
          await service.updateSsoConfig(crypto.randomUUID(), null);

          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });
  });

  describe('requestDnsVerification', () => {
    describe('Given domain exists without token', () => {
      describe('When requesting DNS verification', () => {
        it('Then generates token and returns DNS record info', async () => {
          const domainId = crypto.randomUUID();
          const mockDb = new MockDbBuilder()
            .mockResult([{ name: 'acme.com', verificationToken: null }])
            .mockResult(undefined)
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.requestDnsVerification(domainId);

          expect(result.domainName).toBe('acme.com');
          expect(result.dnsRecordType).toBe('TXT');
          expect(result.dnsRecordName).toBe('_agentinsync.acme.com');
          expect(result.dnsRecordValue).toContain('agentinsync-verify=');
        });
      });
    });

    describe('Given domain exists with token', () => {
      describe('When requesting DNS verification', () => {
        it('Then returns existing token info', async () => {
          const existingToken = 'existingtoken123';
          const mockDb = new MockDbBuilder()
            .mockResult([{ name: 'acme.com', verificationToken: existingToken }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.requestDnsVerification(crypto.randomUUID());

          expect(result.dnsRecordValue).toBe(`agentinsync-verify=${existingToken}`);
        });
      });
    });

    describe('Given domain does not exist', () => {
      describe('When requesting DNS verification', () => {
        it('Then throws error', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new DomainService(createMockDeps(mockDb));

          await expect(service.requestDnsVerification(crypto.randomUUID())).rejects.toThrow(
            'Domain not found'
          );
        });
      });
    });
  });

  describe('getVerificationStatus', () => {
    describe('Given domain exists', () => {
      describe('When getting verification status', () => {
        it('Then returns status with social proof progress', async () => {
          const domainId = crypto.randomUUID();
          const mockDb = new MockDbBuilder()
            .mockResult([
              {
                name: 'acme.com',
                status: 'pending',
                verificationMethod: null,
                verificationToken: 'token123',
                verifiedAt: null,
              },
            ])
            .mockResult([{ count: 2 }])
            .build();

          const service = new DomainService(createMockDeps(mockDb));
          const result = await service.getVerificationStatus(domainId);

          expect(result.domainName).toBe('acme.com');
          expect(result.status).toBe('pending');
          expect(result.memberCount).toBe(2);
          expect(result.socialProofThreshold).toBe(3);
          expect(result.socialProofProgress).toBe(2);
          expect(result.dnsVerification).not.toBeNull();
          expect(result.dnsVerification?.recordValue).toContain('token123');
        });
      });
    });

    describe('Given domain does not exist', () => {
      describe('When getting verification status', () => {
        it('Then throws error', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new DomainService(createMockDeps(mockDb));

          await expect(service.getVerificationStatus(crypto.randomUUID())).rejects.toThrow(
            'Domain not found'
          );
        });
      });
    });
  });

  describe('verifyByAdmin', () => {
    it('sets domain status to verified with super_admin method', async () => {
      const domainId = crypto.randomUUID();

      // verifyDomain does: update + select (for logging) — mock both results
      const mockDb = new MockDbBuilder()
        .mockResult(undefined) // UPDATE domains SET status='verified'
        .mockResult([aDomain().withId(domainId).withStatus('verified').build()]) // SELECT for logging
        .build();

      const service = new DomainService(createMockDeps(mockDb));
      await service.verifyByAdmin(domainId);

      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
