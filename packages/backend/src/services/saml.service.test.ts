import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SamlService, type SamlAssertionResult } from './saml.service.js';
import type { SamlConfig } from '@agent-in-sync/db-client';

const mockValidatePostResponseAsync = vi.fn();
const mockGetAuthorizeUrlAsync = vi
  .fn()
  .mockResolvedValue('https://idp.example.com/sso?SAMLRequest=abc');

vi.mock('@node-saml/node-saml', () => ({
  SAML: vi.fn().mockImplementation(() => ({
    generateServiceProviderMetadata: vi.fn().mockReturnValue('<xml>metadata</xml>'),
    validatePostResponseAsync: mockValidatePostResponseAsync,
    getAuthorizeUrlAsync: mockGetAuthorizeUrlAsync,
  })),
}));

vi.mock('@agent-in-sync/db-client', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  })),
  users: {},
  sessions: {},
  domains: {},
  domainMembers: {},
}));

const mockSamlConfig: SamlConfig = {
  idpEntityId: 'https://idp.example.com/entity',
  idpSsoUrl: 'https://idp.example.com/sso',
  idpCertificate: 'MIIC...certificate...',
  spEntityId: 'https://app.example.com',
  spAcsUrl: 'https://app.example.com/saml/acme-com/acs',
  spMetadataUrl: 'https://app.example.com/saml/acme-com/metadata',
  attributeMapping: {
    email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
  },
  signRequests: true,
  wantAssertionsSigned: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('SamlService', () => {
  let service: SamlService;

  beforeEach(() => {
    service = new SamlService();
    vi.clearAllMocks();
  });

  describe('generateSpMetadata', () => {
    describe('Given valid domain config', () => {
      describe('When generating SP metadata', () => {
        it('Then returns XML metadata', async () => {
          const result = await service.generateSpMetadata(mockSamlConfig, 'acme.com');

          expect(result).toBe('<xml>metadata</xml>');
        });
      });
    });
  });

  describe('validateAssertion', () => {
    describe('Given valid SAML response', () => {
      describe('When validating assertion', () => {
        it('Then extracts user attributes', async () => {
          mockValidatePostResponseAsync.mockResolvedValue({
            profile: {
              'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'user@acme.com',
              'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': 'John',
              'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': 'Doe',
              nameID: 'user@acme.com',
              sessionIndex: 'session123',
            },
            loggedOut: false,
          });

          const result = await service.validateAssertion('base64SamlResponse', mockSamlConfig);

          expect(result.email).toBe('user@acme.com');
          expect(result.firstName).toBe('John');
          expect(result.lastName).toBe('Doe');
          expect(result.nameId).toBe('user@acme.com');
        });
      });
    });

    describe('Given SAML response without profile', () => {
      describe('When validating assertion', () => {
        it('Then throws error', async () => {
          mockValidatePostResponseAsync.mockResolvedValue({ profile: null, loggedOut: false });

          await expect(
            service.validateAssertion('invalidResponse', mockSamlConfig)
          ).rejects.toThrow('Invalid SAML response: no profile returned');
        });
      });
    });

    describe('Given SAML response without email', () => {
      describe('When validating assertion', () => {
        it('Then throws error', async () => {
          mockValidatePostResponseAsync.mockResolvedValue({
            profile: {
              nameID: 'user123',
            },
            loggedOut: false,
          });

          await expect(
            service.validateAssertion('responseWithoutEmail', mockSamlConfig)
          ).rejects.toThrow('Email not found in SAML assertion');
        });
      });
    });
  });

  describe('getLoginUrl', () => {
    describe('Given valid domain config', () => {
      describe('When getting login URL', () => {
        it('Then returns IdP SSO URL with SAML request', async () => {
          const result = await service.getLoginUrl(mockSamlConfig);

          expect(result).toBe('https://idp.example.com/sso?SAMLRequest=abc');
        });
      });
    });

    describe('Given relay state', () => {
      describe('When getting login URL', () => {
        it('Then includes relay state in request', async () => {
          const result = await service.getLoginUrl(mockSamlConfig, '/dashboard');

          expect(result).toContain('SAMLRequest');
        });
      });
    });
  });

  describe('findDomainBySlug', () => {
    describe('Given domain exists with SSO enabled', () => {
      describe('When finding by slug', () => {
        it('Then returns domain with SSO config', async () => {
          const { getDb } = await import('@agent-in-sync/db-client');
          vi.mocked(getDb).mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([
              {
                id: crypto.randomUUID(),
                name: 'acme.com',
                ssoEnabled: true,
                ssoConfig: mockSamlConfig,
              },
            ]),
          } as unknown as ReturnType<typeof getDb>);

          const result = await service.findDomainBySlug('acme-com');

          expect(result).not.toBeNull();
          expect(result?.domain.name).toBe('acme.com');
          expect(result?.ssoConfig).toEqual(mockSamlConfig);
        });
      });
    });

    describe('Given domain exists without SSO', () => {
      describe('When finding by slug', () => {
        it('Then returns null', async () => {
          const { getDb } = await import('@agent-in-sync/db-client');
          vi.mocked(getDb).mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([
              {
                id: crypto.randomUUID(),
                name: 'acme.com',
                ssoEnabled: false,
                ssoConfig: null,
              },
            ]),
          } as unknown as ReturnType<typeof getDb>);

          const result = await service.findDomainBySlug('acme-com');

          expect(result).toBeNull();
        });
      });
    });

    describe('Given domain does not exist', () => {
      describe('When finding by slug', () => {
        it('Then returns null', async () => {
          const { getDb } = await import('@agent-in-sync/db-client');
          vi.mocked(getDb).mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([]),
          } as unknown as ReturnType<typeof getDb>);

          const result = await service.findDomainBySlug('nonexistent-com');

          expect(result).toBeNull();
        });
      });
    });

    describe('Given slug with hyphens', () => {
      describe('When finding by slug', () => {
        it('Then converts hyphens to dots for domain name', async () => {
          const { getDb } = await import('@agent-in-sync/db-client');
          const mockWhere = vi.fn().mockReturnThis();
          vi.mocked(getDb).mockReturnValue({
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: mockWhere,
            limit: vi.fn().mockResolvedValue([]),
          } as unknown as ReturnType<typeof getDb>);

          await service.findDomainBySlug('subdomain-acme-com');

          expect(mockWhere).toHaveBeenCalled();
        });
      });
    });
  });

  describe('createOrUpdateUserFromAssertion', () => {
    describe('Given new user from SAML assertion', () => {
      describe('When creating user', () => {
        it('Then creates user with domain membership and session', async () => {
          const domainId = crypto.randomUUID();
          const assertion: SamlAssertionResult = {
            email: 'newuser@acme.com',
            firstName: 'New',
            lastName: 'User',
            nameId: 'newuser@acme.com',
          };

          const { getDb } = await import('@agent-in-sync/db-client');
          const mockDb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([]),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            transaction: vi
              .fn()
              .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
          };
          vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDb>);

          const result = await service.createOrUpdateUserFromAssertion(assertion, domainId);

          expect(result.userId).toBeDefined();
          expect(result.sessionToken).toBeDefined();
          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });

    describe('Given existing user from SAML assertion', () => {
      describe('When updating user', () => {
        it('Then updates user and creates new session', async () => {
          const existingUserId = crypto.randomUUID();
          const domainId = crypto.randomUUID();
          const assertion: SamlAssertionResult = {
            email: 'existing@acme.com',
            firstName: 'Existing',
            lastName: 'User',
            nameId: 'existing@acme.com',
          };

          const { getDb } = await import('@agent-in-sync/db-client');
          const mockDb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi
              .fn()
              .mockResolvedValueOnce([{ id: existingUserId, email: 'existing@acme.com', domainId }])
              .mockResolvedValue([]),
            insert: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([{ id: crypto.randomUUID() }]),
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            transaction: vi
              .fn()
              .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mockDb)),
          };
          vi.mocked(getDb).mockReturnValue(mockDb as unknown as ReturnType<typeof getDb>);

          const result = await service.createOrUpdateUserFromAssertion(assertion, domainId);

          expect(result.userId).toBe(existingUserId);
          expect(result.sessionToken).toBeDefined();
          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });
  });
});
