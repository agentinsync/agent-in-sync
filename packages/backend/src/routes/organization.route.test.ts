import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// ── hoisted mocks ──────────────────────────────────────────────────────────────

const mockCheckSuperAdmin = vi.hoisted(() => vi.fn<(email: string) => Promise<boolean>>());

const mockGetOrganizationMembersWithAgentsPaged = vi.hoisted(() => vi.fn());

// Tracks call index so two sequential db.select() calls can return different values
const mockDbChain = vi.hoisted(() => {
  let responses: unknown[][] = [];
  let callIndex = 0;

  const reset = (values: unknown[][]) => {
    responses = values;
    callIndex = 0;
  };

  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => {
      const val = responses[callIndex] ?? [];
      callIndex++;
      return Promise.resolve(val);
    },
  };

  const select = () => chain;

  return { reset, select };
});

vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn() }));

vi.mock('../auth/index.js', () => ({
  requireAuth: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    req.userId = 'user-id';
    req.user = { email: 'user@example.com' } as Request['user'];
    next();
  }),
  requireOrganization: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

vi.mock('../auth/super-admin.js', () => ({ checkSuperAdmin: mockCheckSuperAdmin }));

vi.mock('@agent-in-sync/db-client', () => ({
  getDb: () => ({ select: mockDbChain.select }),
  users: {},
  organizationMembers: {},
  organizations: {},
  DELETED_ORG_ID: 'deleted-org-id',
}));

vi.mock('../services/organization.service.js', () => ({
  OrganizationService: vi.fn().mockImplementation(() => ({
    getOrganizationMembersWithAgentsPaged: mockGetOrganizationMembersWithAgentsPaged,
    createOrganization: vi.fn(),
    getOrganization: vi.fn(),
    joinOrganization: vi.fn(),
    getUserOrganizations: vi.fn(),
    getOrganizationBySlug: vi.fn(),
    canCreateOrganizationForDomain: vi.fn(),
    getAvailableOrganizations: vi.fn(),
    removeMember: vi.fn(),
    revokeAgentApiKeyInOrg: vi.fn(),
  })),
}));

vi.mock('../services/domain.service.js', () => ({
  DomainService: vi.fn().mockImplementation(() => ({ findById: vi.fn() })),
}));

vi.mock('../services/stats.service.js', () => ({
  StatsService: vi.fn().mockImplementation(() => ({
    getOrganizationStats: vi.fn(),
    getLeaderboard: vi.fn(),
  })),
}));

vi.mock('../observability/index.js', () => ({
  logger: { logError: vi.fn() },
}));

vi.mock('../errors/index.js', () => ({
  ForbiddenError: class extends Error {
    code = 'FORBIDDEN';
  },
}));

// ── test helpers ───────────────────────────────────────────────────────────────

import { organizationRouter } from './organization.route.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/organizations', organizationRouter);
  return app;
}

const ORG_ID = 'org-123';
const MEMBER_ROW = { role: 'member' };
const ADMIN_ROW = { role: 'admin' };
const PUBLIC_ORG = { isPublic: true };
const PRIVATE_ORG = { isPublic: false };
const MEMBERS_RESULT = { members: [], total: 0 };

// ── tests ──────────────────────────────────────────────────────────────────────

describe('GET /organizations/:orgId/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrganizationMembersWithAgentsPaged.mockResolvedValue(MEMBERS_RESULT);
  });

  describe('Given the organization does not exist', () => {
    describe('When any authenticated user requests the member list', () => {
      it('Then returns 404', async () => {
        mockDbChain.reset([[], []]);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Organization not found' });
      });
    });
  });

  describe('Given the organization is public', () => {
    describe('When a non-super-admin requests the member list', () => {
      it('Then returns 403', async () => {
        mockDbChain.reset([[MEMBER_ROW], [PUBLIC_ORG]]);
        mockCheckSuperAdmin.mockResolvedValue(false);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          error: 'Member list is not available for public organizations',
        });
      });
    });

    describe('When a super admin requests the member list', () => {
      it('Then returns 200 with the member list', async () => {
        mockDbChain.reset([[MEMBER_ROW], [PUBLIC_ORG]]);
        mockCheckSuperAdmin.mockResolvedValue(true);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject(MEMBERS_RESULT);
      });
    });

    describe('When a non-member super admin requests the member list', () => {
      it('Then returns 200 (super admin bypasses membership check)', async () => {
        mockDbChain.reset([[], [PUBLIC_ORG]]);
        mockCheckSuperAdmin.mockResolvedValue(true);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(200);
      });
    });
  });

  describe('Given the organization is private', () => {
    describe('When a non-member requests the member list', () => {
      it('Then returns 403', async () => {
        mockDbChain.reset([[], [PRIVATE_ORG]]);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'You are not a member of this organization' });
      });
    });

    describe('When a member requests the member list', () => {
      it('Then returns 200 with the member list and member role', async () => {
        mockDbChain.reset([[MEMBER_ROW], [PRIVATE_ORG]]);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ...MEMBERS_RESULT, callerRole: 'member' });
      });
    });

    describe('When an admin requests the member list', () => {
      it('Then returns 200 with the member list and admin role', async () => {
        mockDbChain.reset([[ADMIN_ROW], [PRIVATE_ORG]]);

        const res = await request(createApp()).get(`/organizations/${ORG_ID}/members`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ...MEMBERS_RESULT, callerRole: 'admin' });
      });
    });
  });
});
