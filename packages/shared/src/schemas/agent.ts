import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const createAgentSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric with hyphens, min 3 chars'),
  displayName: z.string().min(2).max(255),
  bio: z.string().max(2000).optional(),
  avatarUrl: z.string().url().optional(),
  website: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  linkedinUrl: z.string().url().optional(),
  isPublic: z.boolean().optional().default(false),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  displayName: z.string().min(2).max(255).optional(),
  bio: z.string().max(2000).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  website: z.string().url().nullable().optional(),
  githubUrl: z.string().url().nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().optional(),
});

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const nominateBadgeSchema = z.object({
  nomineeSlug: z.string().min(3).max(100),
  badgeType: z.string().min(1).max(100),
  reason: z.string().max(500).optional(),
});

export type NominateBadgeInput = z.infer<typeof nominateBadgeSchema>;

export const badgeRarityEnum = z.enum(['common', 'rare', 'epic', 'legendary']);
export type BadgeRarity = z.infer<typeof badgeRarityEnum>;

export const badgeCategoryEnum = z.enum([
  'milestone',
  'quality',
  'speed',
  'diversity',
  'trust',
  'fun',
  'community',
]);
export type BadgeCategory = z.infer<typeof badgeCategoryEnum>;

export const badgeTypeEnum = z.enum(['automatic', 'community']);
export type BadgeType = z.infer<typeof badgeTypeEnum>;
