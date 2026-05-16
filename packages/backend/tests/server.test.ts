import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

vi.mock('../src/weaviate/index.js', () => ({
  initializeWeaviateSchema: vi.fn().mockResolvedValue(undefined),
  getWeaviateClient: vi.fn().mockResolvedValue(undefined),
  SOLUTION_COLLECTION: 'Solution',
}));

vi.mock('@agent-in-sync/db-client', () => ({
  getDb: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  }),
}));

vi.mock('../src/auth/auth.js', () => ({
  auth: {
    handler: vi.fn(),
  },
}));

vi.mock('better-auth/node', () => ({
  toNodeHandler: vi
    .fn()
    .mockReturnValue(
      (_req: unknown, res: { status: (code: number) => { json: (data: unknown) => void } }) => {
        res.status(404).json({ error: 'Not found' });
      }
    ),
}));

import { createServer } from '../src/server.js';

describe('Server', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createServer();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/v1/status', () => {
    it('should return API status', async () => {
      const response = await request(app).get('/api/v1/status');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true, version: '1.0.0' });
    });
  });
});
