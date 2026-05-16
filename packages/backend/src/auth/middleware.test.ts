import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireAdmin, requireSuperAdmin, requireOwnership } from './middleware.js';

vi.mock('./super-admin.js', () => ({
  checkSuperAdmin: vi.fn(async (email: string) => email === 'superadmin@example.com'),
}));

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    userId: undefined,
    user: undefined,
    organizationId: undefined,
    membershipRole: undefined,
    isSuperAdmin: undefined,
    ...overrides,
  } as unknown as Request;
}

function createMockResponse(): Response & { statusCode: number; jsonData: unknown } {
  const res = {
    statusCode: 200,
    jsonData: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; jsonData: unknown };
}

describe('requireAdmin', () => {
  describe('Given user is admin', () => {
    describe('When middleware is called', () => {
      it('Then calls next()', async () => {
        const req = createMockRequest({ membershipRole: 'admin' });
        const res = createMockResponse();
        const next = vi.fn();

        await requireAdmin(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
      });
    });
  });

  describe('Given user is reviewer', () => {
    describe('When middleware is called', () => {
      it('Then returns 403 forbidden', async () => {
        const req = createMockRequest({ membershipRole: 'reviewer' });
        const res = createMockResponse();
        const next = vi.fn();

        await requireAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.jsonData).toEqual({ error: 'Admin role required' });
      });
    });
  });

  describe('Given user is member', () => {
    describe('When middleware is called', () => {
      it('Then returns 403 forbidden', async () => {
        const req = createMockRequest({ membershipRole: 'member' });
        const res = createMockResponse();
        const next = vi.fn();

        await requireAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
      });
    });
  });

  describe('Given user has no role', () => {
    describe('When middleware is called', () => {
      it('Then returns 403 forbidden', async () => {
        const req = createMockRequest({});
        const res = createMockResponse();
        const next = vi.fn();

        await requireAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
      });
    });
  });

  describe('Given user is super admin without explicit membershipRole', () => {
    describe('When middleware is called', () => {
      it('Then calls next() without checking membershipRole', async () => {
        const req = createMockRequest({ isSuperAdmin: true });
        const res = createMockResponse();
        const next = vi.fn();

        await requireAdmin(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
      });
    });
  });
});

describe('requireSuperAdmin', () => {
  describe('Given user is super admin', () => {
    describe('When middleware is called', () => {
      it('Then calls next() and sets isSuperAdmin flag', async () => {
        const req = createMockRequest({
          user: { email: 'superadmin@example.com' } as Request['user'],
        });
        const res = createMockResponse();
        const next = vi.fn();

        await requireSuperAdmin(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.isSuperAdmin).toBe(true);
      });
    });
  });

  describe('Given user is not super admin', () => {
    describe('When middleware is called', () => {
      it('Then returns 403 forbidden', async () => {
        const req = createMockRequest({
          user: { email: 'regular@example.com' } as Request['user'],
        });
        const res = createMockResponse();
        const next = vi.fn();

        await requireSuperAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.jsonData).toEqual({ error: 'Super admin access required' });
      });
    });
  });

  describe('Given user has no email', () => {
    describe('When middleware is called', () => {
      it('Then returns 403 forbidden', async () => {
        const req = createMockRequest({ user: undefined });
        const res = createMockResponse();
        const next = vi.fn();

        await requireSuperAdmin(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
      });
    });
  });
});

describe('requireOwnership', () => {
  describe('Given user is the owner', () => {
    describe('When checking ownership', () => {
      it('Then calls next()', async () => {
        const userId = crypto.randomUUID();
        const req = createMockRequest({ userId });
        const res = createMockResponse();
        const next = vi.fn();

        const getAuthorId = vi.fn().mockResolvedValue(userId);
        const middleware = requireOwnership(getAuthorId);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
      });
    });
  });

  describe('Given user is org admin', () => {
    describe('When checking ownership of another users resource', () => {
      it('Then calls next()', async () => {
        const userId = crypto.randomUUID();
        const authorId = crypto.randomUUID();
        const req = createMockRequest({ userId, membershipRole: 'admin' });
        const res = createMockResponse();
        const next = vi.fn();

        const getAuthorId = vi.fn().mockResolvedValue(authorId);
        const middleware = requireOwnership(getAuthorId);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });
  });

  describe('Given user is super admin', () => {
    describe('When checking ownership of another users resource', () => {
      it('Then calls next()', async () => {
        const userId = crypto.randomUUID();
        const authorId = crypto.randomUUID();
        const req = createMockRequest({ userId, isSuperAdmin: true });
        const res = createMockResponse();
        const next = vi.fn();

        const getAuthorId = vi.fn().mockResolvedValue(authorId);
        const middleware = requireOwnership(getAuthorId);

        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
      });
    });
  });

  describe('Given user is neither owner nor admin', () => {
    describe('When checking ownership', () => {
      it('Then returns 403 forbidden', async () => {
        const userId = crypto.randomUUID();
        const authorId = crypto.randomUUID();
        const req = createMockRequest({ userId, membershipRole: 'member' });
        const res = createMockResponse();
        const next = vi.fn();

        const getAuthorId = vi.fn().mockResolvedValue(authorId);
        const middleware = requireOwnership(getAuthorId);

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
        expect(res.jsonData).toEqual({ error: 'Not authorized to modify this resource' });
      });
    });
  });

  describe('Given resource does not exist', () => {
    describe('When checking ownership', () => {
      it('Then returns 403 forbidden (authorId is null)', async () => {
        const userId = crypto.randomUUID();
        const req = createMockRequest({ userId, membershipRole: 'member' });
        const res = createMockResponse();
        const next = vi.fn();

        const getAuthorId = vi.fn().mockResolvedValue(null);
        const middleware = requireOwnership(getAuthorId);

        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(403);
      });
    });
  });
});
