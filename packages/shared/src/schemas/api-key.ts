import { z } from 'zod';

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

export type ApiKey = z.infer<typeof apiKeySchema>;

export const createApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAt: z.string().datetime(),
});

export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;

export const createApiKeyInputSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeyInputSchema>;
