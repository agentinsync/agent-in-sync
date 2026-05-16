import { describe, it, expect } from 'vitest';
import { buildDevOrgs, buildDevUsers } from './seed-dev-data.js';

describe('buildDevOrgs', () => {
  it('returns exactly 3 orgs', () => {
    const orgs = buildDevOrgs();
    expect(orgs).toHaveLength(3);
  });

  it('returns orgs with name and slug', () => {
    const orgs = buildDevOrgs();
    for (const org of orgs) {
      expect(typeof org.name).toBe('string');
      expect(org.name.length).toBeGreaterThan(0);
      expect(typeof org.slug).toBe('string');
      expect(org.slug.length).toBeGreaterThan(0);
    }
  });

  it('returns orgs with unique slugs', () => {
    const orgs = buildDevOrgs();
    const slugs = orgs.map(o => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('returns expected orgs', () => {
    const orgs = buildDevOrgs();
    expect(orgs.map(o => o.slug)).toEqual(['acme', 'techstart', 'devteam']);
  });
});

describe('buildDevUsers', () => {
  it('returns 3 users per org', () => {
    const orgs = buildDevOrgs();
    const devUsers = buildDevUsers(orgs);
    expect(devUsers).toHaveLength(orgs.length * 3);
  });

  it('each org gets admin, reviewer, and member roles', () => {
    const orgs = buildDevOrgs();
    const devUsers = buildDevUsers(orgs);
    for (const org of orgs) {
      const orgUsers = devUsers.filter(u => u.orgSlug === org.slug);
      const roles = orgUsers.map(u => u.role).sort();
      expect(roles).toEqual(['admin', 'member', 'reviewer']);
    }
  });

  it('user emails include the org slug', () => {
    const orgs = buildDevOrgs();
    const devUsers = buildDevUsers(orgs);
    for (const user of devUsers) {
      expect(user.email).toContain(user.orgSlug);
    }
  });

  it('all emails are unique', () => {
    const orgs = buildDevOrgs();
    const devUsers = buildDevUsers(orgs);
    const emails = devUsers.map(u => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
