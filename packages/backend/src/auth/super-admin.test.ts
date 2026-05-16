import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('isSuperAdmin', () => {
  const originalEnv = process.env.SUPER_ADMIN_EMAILS;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SUPER_ADMIN_EMAILS = originalEnv;
    } else {
      delete process.env.SUPER_ADMIN_EMAILS;
    }
  });

  describe('Given SUPER_ADMIN_EMAILS is set', () => {
    describe('When checking a super admin email', () => {
      it('Then returns true', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@example.com,founder@example.com';
        const { isSuperAdmin } = await import('./super-admin.js');

        expect(isSuperAdmin('admin@example.com')).toBe(true);
        expect(isSuperAdmin('founder@example.com')).toBe(true);
      });
    });

    describe('When checking email with different case', () => {
      it('Then returns true (case insensitive)', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@example.com';
        const { isSuperAdmin } = await import('./super-admin.js');

        expect(isSuperAdmin('ADMIN@EXAMPLE.COM')).toBe(true);
        expect(isSuperAdmin('Admin@Example.Com')).toBe(true);
      });
    });

    describe('When checking a non-super admin email', () => {
      it('Then returns false', async () => {
        process.env.SUPER_ADMIN_EMAILS = 'admin@example.com';
        const { isSuperAdmin } = await import('./super-admin.js');

        expect(isSuperAdmin('user@example.com')).toBe(false);
        expect(isSuperAdmin('other@example.com')).toBe(false);
      });
    });
  });

  describe('Given SUPER_ADMIN_EMAILS is empty', () => {
    describe('When checking any email', () => {
      it('Then returns false', async () => {
        process.env.SUPER_ADMIN_EMAILS = '';
        const { isSuperAdmin } = await import('./super-admin.js');

        expect(isSuperAdmin('admin@example.com')).toBe(false);
      });
    });
  });

  describe('Given SUPER_ADMIN_EMAILS is not set', () => {
    describe('When checking any email', () => {
      it('Then returns false', async () => {
        delete process.env.SUPER_ADMIN_EMAILS;
        const { isSuperAdmin } = await import('./super-admin.js');

        expect(isSuperAdmin('admin@example.com')).toBe(false);
      });
    });
  });

  describe('Given SUPER_ADMIN_EMAILS has whitespace', () => {
    describe('When checking emails', () => {
      it('Then trims whitespace correctly', async () => {
        process.env.SUPER_ADMIN_EMAILS = ' admin@example.com , founder@example.com ';
        const { isSuperAdmin } = await import('./super-admin.js');

        expect(isSuperAdmin('admin@example.com')).toBe(true);
        expect(isSuperAdmin('founder@example.com')).toBe(true);
      });
    });
  });
});
