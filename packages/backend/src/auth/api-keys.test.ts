import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockDbBuilder } from '../test-utils/mocks.js';

const mockGetDb = vi.fn();

vi.mock('@agent-in-sync/db-client', () => ({
  getDb: () => mockGetDb(),
  apiKeys: {},
  organizations: {},
  agents: {},
  users: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

const { createApiKey, regenerateApiKey } = await import('./api-keys.js');

const ORG_ID = crypto.randomUUID();
const USER_ID = crypto.randomUUID();
const KEY_ID = crypto.randomUUID();
const AGENT_ID = crypto.randomUUID();

describe('createApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given a key already exists for this user and organization', () => {
    describe('When createApiKey is called', () => {
      it('Then throws API_KEY_ALREADY_EXISTS', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([{ isPublic: false }]) // org lookup
          .mockResult([{ id: KEY_ID }]) // existing key found
          .build();
        mockGetDb.mockReturnValue(mockDb);

        await expect(createApiKey(USER_ID, ORG_ID, 'My Key')).rejects.toThrow(
          'API_KEY_ALREADY_EXISTS'
        );
      });
    });
  });

  describe('Given the organization does not exist', () => {
    describe('When createApiKey is called', () => {
      it('Then throws Organization not found', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([]) // org not found
          .build();
        mockGetDb.mockReturnValue(mockDb);

        await expect(createApiKey(USER_ID, ORG_ID, 'My Key')).rejects.toThrow(
          'Organization not found'
        );
      });
    });
  });

  describe('Given no existing key and org exists', () => {
    describe('When createApiKey is called', () => {
      it('Then creates a new agent and key and returns them', async () => {
        const newKeyId = crypto.randomUUID();
        const newAgentId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([{ isPublic: false }]) // org lookup
          .mockResult([]) // no existing key
          .mockResult([{ name: 'Alice' }]) // user lookup
          .mockResult([{ id: newAgentId }]) // insert agent returning
          .mockResult([{ id: newKeyId }]) // insert key returning
          .build();
        mockGetDb.mockReturnValue(mockDb);

        const result = await createApiKey(USER_ID, ORG_ID, 'My Key');

        expect(result.id).toBe(newKeyId);
        expect(result.agentId).toBe(newAgentId);
        expect(result.organizationId).toBe(ORG_ID);
        expect(result.key).toMatch(/^ask_prv_/);
      });
    });
  });
});

describe('regenerateApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Given the key does not belong to the user', () => {
    describe('When regenerateApiKey is called', () => {
      it('Then throws API key not found', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([]) // key not found for this user
          .build();
        mockGetDb.mockReturnValue(mockDb);

        await expect(regenerateApiKey(USER_ID, KEY_ID)).rejects.toThrow('API key not found');
      });
    });
  });

  describe('Given the key exists and belongs to the user', () => {
    describe('When regenerateApiKey is called', () => {
      it('Then revokes the old key and returns a new one with the same agent', async () => {
        const newKeyId = crypto.randomUUID();

        const mockDb = new MockDbBuilder()
          .mockResult([{ agentId: AGENT_ID, organizationId: ORG_ID, name: 'CLI Setup' }]) // existing key
          .mockResult([{ isPublic: true }]) // org lookup
          .mockResult([]) // delete old key
          .mockResult([{ id: newKeyId }]) // insert new key returning
          .build();
        mockGetDb.mockReturnValue(mockDb);

        const result = await regenerateApiKey(USER_ID, KEY_ID);

        expect(result.id).toBe(newKeyId);
        expect(result.organizationId).toBe(ORG_ID);
        expect(result.key).toMatch(/^ask_pub_/);
        expect(mockDb.delete).toHaveBeenCalled();
        expect(mockDb.insert).toHaveBeenCalled();
      });
    });
  });

  describe('Given the key exists but the organization is gone', () => {
    describe('When regenerateApiKey is called', () => {
      it('Then throws Organization not found', async () => {
        const mockDb = new MockDbBuilder()
          .mockResult([{ agentId: AGENT_ID, organizationId: ORG_ID, name: 'CLI Setup' }]) // existing key
          .mockResult([]) // org not found
          .build();
        mockGetDb.mockReturnValue(mockDb);

        await expect(regenerateApiKey(USER_ID, KEY_ID)).rejects.toThrow('Organization not found');
      });
    });
  });
});
