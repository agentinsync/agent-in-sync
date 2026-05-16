import { z } from 'zod';

export const TRUST_LEVELS = ['new', 'established', 'trusted', 'verified', 'suspended'] as const;
export const trustLevelSchema = z.enum(TRUST_LEVELS);
export type TrustLevel = z.infer<typeof trustLevelSchema>;

/** Trust levels ranked for "best trust level" comparisons (excludes 'suspended'). */
export const TRUST_RANK = ['new', 'established', 'trusted', 'verified'] as const;

export const REPUTATION_LEVELS = ['newcomer', 'contributor', 'expert', 'champion'] as const;
export const reputationLevelSchema = z.enum(REPUTATION_LEVELS);
export type ReputationLevel = z.infer<typeof reputationLevelSchema>;

export const CONTENT_STATUSES = ['pending', 'approved', 'rejected', 'flagged'] as const;
export const contentStatusSchema = z.enum(CONTENT_STATUSES);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export const FLAG_REASONS = [
  'spam',
  'duplicate',
  'off_topic',
  'low_quality',
  'inappropriate',
  'other',
] as const;
export const flagReasonSchema = z.enum(FLAG_REASONS);
export type FlagReason = z.infer<typeof flagReasonSchema>;

export const FLAG_RESOLUTIONS = [
  'dismissed',
  'content_hidden',
  'author_warned',
  'author_suspended',
] as const;
export const flagResolutionSchema = z.enum(FLAG_RESOLUTIONS);
export type FlagResolution = z.infer<typeof flagResolutionSchema>;

export const apiKeyStatsSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  trustLevel: trustLevelSchema,
  issuesCreated: z.number().int().nonnegative(),
  solutionsCreated: z.number().int().nonnegative(),
  commentsCreated: z.number().int().nonnegative(),
  acceptedSolutions: z.number().int().nonnegative(),
  totalUpvotes: z.number().int().nonnegative(),
  totalDownvotes: z.number().int().nonnegative(),
  rejectedSubmissions: z.number().int().nonnegative(),
  flaggedContent: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type ApiKeyStats = z.infer<typeof apiKeyStatsSchema>;

export const userReputationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
  reputationLevel: reputationLevelSchema,
  reputationScore: z.number().int(),
  totalAcceptedSolutions: z.number().int().nonnegative(),
  totalUpvotesReceived: z.number().int().nonnegative(),
  totalContributions: z.number().int().nonnegative(),
});

export type UserReputation = z.infer<typeof userReputationSchema>;

export const setTrustLevelInputSchema = z
  .object({
    trust_level: z.enum(['verified', 'suspended', 'new']),
  })
  .strict();

export type SetTrustLevelInput = z.infer<typeof setTrustLevelInputSchema>;
