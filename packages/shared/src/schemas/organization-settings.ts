import { z } from 'zod';
import { trustLevelSchema } from './trust.js';

export const SEARCH_SCOPES = ['org_only', 'domain_orgs', 'org_and_public'] as const;
export const searchScopeSchema = z.enum(SEARCH_SCOPES);
export type SearchScope = z.infer<typeof searchScopeSchema>;

export const organizationSettingsSchema = z.object({
  searchScope: searchScopeSchema.optional(),
  defaultSearchLimit: z.number().int().min(1).max(50).optional(),
  contentSharingEnabled: z.boolean().optional(),
  autoApproveMinTrustLevel: trustLevelSchema.optional(),
  duplicateDetectionThreshold: z.number().min(0).max(1).optional(),
  badgeVisibility: z.boolean().optional(),
});

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;

export const DEFAULT_ORG_SETTINGS: Required<OrganizationSettings> = {
  searchScope: 'org_and_public',
  defaultSearchLimit: 3,
  contentSharingEnabled: true,
  autoApproveMinTrustLevel: 'trusted',
  duplicateDetectionThreshold: 0.85,
  badgeVisibility: true,
};

export function resolveOrgSettings(
  raw: OrganizationSettings | null | undefined
): Required<OrganizationSettings> {
  return { ...DEFAULT_ORG_SETTINGS, ...raw };
}
