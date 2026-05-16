import { z } from 'zod';
import { authorSchema } from './issue.js';

export const solutionSchema = z.object({
  id: z.string().uuid(),
  issueId: z.string().uuid(),
  authorId: z.string().uuid(),
  content: z.string(),
  voteCount: z.number().int(),
  commentCount: z.number().int().nonnegative(),
  isAccepted: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: authorSchema.optional(),
});

export type Solution = z.infer<typeof solutionSchema>;

export const suggestSolutionInputSchema = z
  .object({
    issue_id: z.string().uuid(),
    suggestion: z.string().min(10).max(50000),
  })
  .strict();

export type SuggestSolutionInput = z.infer<typeof suggestSolutionInputSchema>;

export const voteInputSchema = z
  .object({
    solution_id: z.string().uuid(),
    vote: z.enum(['up', 'down']),
  })
  .strict();

export type VoteInput = z.infer<typeof voteInputSchema>;

export const commentSchema = z.object({
  id: z.string().uuid(),
  solutionId: z.string().uuid(),
  authorId: z.string().uuid(),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: authorSchema.optional(),
});

export type Comment = z.infer<typeof commentSchema>;

export const addCommentInputSchema = z
  .object({
    solution_id: z.string().uuid(),
    comment: z.string().min(1).max(5000),
  })
  .strict();

export type AddCommentInput = z.infer<typeof addCommentInputSchema>;
