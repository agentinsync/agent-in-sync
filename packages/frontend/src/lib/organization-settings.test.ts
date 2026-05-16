import { describe, it, expect } from 'vitest';
import {
  organizationSettingsSchema,
  resolveOrgSettings,
  DEFAULT_ORG_SETTINGS,
} from '@agent-in-sync/shared';

describe('organizationSettingsSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = organizationSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid full settings', () => {
    const result = organizationSettingsSchema.safeParse({
      searchScope: 'org_only',
      defaultSearchLimit: 5,
      contentSharingEnabled: false,
      autoApproveMinTrustLevel: 'verified',
      duplicateDetectionThreshold: 0.9,
      badgeVisibility: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid searchScope', () => {
    const result = organizationSettingsSchema.safeParse({ searchScope: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects defaultSearchLimit out of range', () => {
    expect(organizationSettingsSchema.safeParse({ defaultSearchLimit: 0 }).success).toBe(false);
    expect(organizationSettingsSchema.safeParse({ defaultSearchLimit: 51 }).success).toBe(false);
    expect(organizationSettingsSchema.safeParse({ defaultSearchLimit: -1 }).success).toBe(false);
  });

  it('accepts defaultSearchLimit at boundaries', () => {
    expect(organizationSettingsSchema.safeParse({ defaultSearchLimit: 1 }).success).toBe(true);
    expect(organizationSettingsSchema.safeParse({ defaultSearchLimit: 50 }).success).toBe(true);
  });

  it('rejects duplicateDetectionThreshold out of range', () => {
    expect(
      organizationSettingsSchema.safeParse({ duplicateDetectionThreshold: -0.1 }).success
    ).toBe(false);
    expect(organizationSettingsSchema.safeParse({ duplicateDetectionThreshold: 1.1 }).success).toBe(
      false
    );
  });

  it('rejects invalid autoApproveMinTrustLevel', () => {
    const result = organizationSettingsSchema.safeParse({ autoApproveMinTrustLevel: 'ultra' });
    expect(result.success).toBe(false);
  });
});

describe('resolveOrgSettings', () => {
  it('returns all defaults when given null', () => {
    const result = resolveOrgSettings(null);
    expect(result).toEqual(DEFAULT_ORG_SETTINGS);
  });

  it('returns all defaults when given undefined', () => {
    const result = resolveOrgSettings(undefined);
    expect(result).toEqual(DEFAULT_ORG_SETTINGS);
  });

  it('merges partial settings with defaults', () => {
    const result = resolveOrgSettings({ searchScope: 'org_only', defaultSearchLimit: 7 });
    expect(result.searchScope).toBe('org_only');
    expect(result.defaultSearchLimit).toBe(7);
    expect(result.contentSharingEnabled).toBe(true);
    expect(result.autoApproveMinTrustLevel).toBe('trusted');
    expect(result.duplicateDetectionThreshold).toBe(0.85);
    expect(result.badgeVisibility).toBe(true);
  });

  it('overrides all defaults when full settings provided', () => {
    const full = {
      searchScope: 'domain_orgs' as const,
      defaultSearchLimit: 10,
      contentSharingEnabled: false,
      autoApproveMinTrustLevel: 'new' as const,
      duplicateDetectionThreshold: 0.5,
      badgeVisibility: false,
    };
    const result = resolveOrgSettings(full);
    expect(result).toEqual(full);
  });
});
