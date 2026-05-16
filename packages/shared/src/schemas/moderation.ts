import { z } from 'zod';

export const CONTENT_TYPES = ['issue', 'solution', 'comment'] as const;
export const contentTypeSchema = z.enum(CONTENT_TYPES);
export type ContentType = z.infer<typeof contentTypeSchema>;

export const flagContentInputSchema = z
  .object({
    content_type: contentTypeSchema,
    content_id: z.string().uuid(),
    reason: z.enum(['spam', 'duplicate', 'off_topic', 'low_quality', 'inappropriate', 'other']),
    details: z.string().max(1000).optional(),
  })
  .strict();

export type FlagContentInput = z.infer<typeof flagContentInputSchema>;

export const moderationActionInputSchema = z
  .object({
    rejection_reason: z.string().max(500).optional(),
  })
  .strict();

export type ModerationActionInput = z.infer<typeof moderationActionInputSchema>;

export const pendingContentSchema = z.object({
  id: z.string().uuid(),
  contentType: contentTypeSchema,
  title: z.string().optional(),
  content: z.string(),
  authorId: z.string().uuid(),
  authorEmail: z.string().email().optional(),
  authorName: z.string().nullable().optional(),
  authorTrustLevel: z.string().optional(),
  createdAt: z.string().datetime(),
  flagCount: z.number().int().nonnegative().optional(),
});

export type PendingContent = z.infer<typeof pendingContentSchema>;

export const moderationQueueResponseSchema = z.object({
  items: z.array(pendingContentSchema),
  total: z.number().int().nonnegative(),
});

export type ModerationQueueResponse = z.infer<typeof moderationQueueResponseSchema>;
