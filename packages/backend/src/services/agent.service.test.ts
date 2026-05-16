import { describe, it, expect, vi } from 'vitest';
import { AgentService } from './agent.service.js';
import { MockDbBuilder, createMockDeps } from '../test-utils/mocks.js';

vi.mock('../auth/api-keys.js', () => ({
  createApiKeyForAgent: vi.fn().mockResolvedValue({
    id: 'new-key-id',
    key: 'ask_prv_abc123',
    prefix: 'ask_prv_abc123',
  }),
}));

function anAgent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    slug: 'test-agent-a1b2',
    displayName: "Test User's Agent",
    avatarUrl: null,
    bio: null,
    website: null,
    githubUrl: null,
    linkedinUrl: null,
    organizationId: crypto.randomUUID(),
    isPublic: true,
    badgeCount: 0,
    createdByUserId: crypto.randomUUID(),
    connectedUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AgentService', () => {
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();

  describe('updateAgent', () => {
    describe('Given agent exists and user is the creator', () => {
      describe('When creator updates agent', () => {
        it('Then allows the update', async () => {
          const agent = anAgent({ createdByUserId: userId, organizationId });

          const mockDb = new MockDbBuilder()
            .mockResult([agent]) // SELECT agent by slug
            .mockResult([agent]) // UPDATE returning
            .mockResult([]) // fetchBadges
            .mockResult([{ count: 0, activeOrgs: 0 }]) // aggregateStats: issue stats
            .mockResult([{ count: 0, accepted: 0, upvotes: 0 }]) // aggregateStats: solution stats
            .mockResult([{ count: 0 }]) // aggregateStats: comment count
            .mockResult([{ count: 0 }]) // aggregateStats: wiki pages created
            .mockResult([{ count: 0 }]) // aggregateStats: wiki edits
            .mockResult([{ count: 0 }]) // aggregateStats: sources ingested
            .mockResult([]) // aggregateStats: linked keys (trust)
            .mockResult([{ id: userId, name: 'Creator', image: null }]) // createdByUser
            .mockResult([{ name: 'Test Org' }]) // organizationName
            .mockResult([]) // getAgentApiKeyInfo
            .build();

          const service = new AgentService(createMockDeps(mockDb));
          const result = await service.updateAgent(
            'test-agent-a1b2',
            { bio: 'Updated bio' },
            userId
          );

          expect(result.bio).toBeNull(); // mock returns original agent data
          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given agent exists and requestingAgentId matches', () => {
      describe('When agent self-updates', () => {
        it('Then allows the update via self-update check', async () => {
          const agentId = crypto.randomUUID();
          const otherUserId = crypto.randomUUID();
          const agent = anAgent({
            id: agentId,
            createdByUserId: otherUserId,
            organizationId,
          });

          const mockDb = new MockDbBuilder()
            .mockResult([agent]) // SELECT agent by slug
            .mockResult([agent]) // UPDATE returning
            .mockResult([]) // fetchBadges
            .mockResult([{ count: 0, activeOrgs: 0 }]) // aggregateStats: issue stats
            .mockResult([{ count: 0, accepted: 0, upvotes: 0 }]) // aggregateStats: solution stats
            .mockResult([{ count: 0 }]) // aggregateStats: comment count
            .mockResult([{ count: 0 }]) // aggregateStats: wiki pages created
            .mockResult([{ count: 0 }]) // aggregateStats: wiki edits
            .mockResult([{ count: 0 }]) // aggregateStats: sources ingested
            .mockResult([]) // aggregateStats: linked keys (trust)
            .mockResult([{ id: otherUserId, name: 'Creator', image: null }]) // createdByUser
            .mockResult([{ name: 'Test Org' }]) // organizationName
            .build();

          const anotherUserId = crypto.randomUUID();
          const service = new AgentService(createMockDeps(mockDb));
          const result = await service.updateAgent(
            'test-agent-a1b2',
            { bio: 'Self update' },
            anotherUserId,
            agentId
          );

          expect(mockDb.update).toHaveBeenCalled();
          expect(result).toBeDefined();
        });
      });
    });

    describe('Given agent exists but user is neither creator nor self', () => {
      describe('When unauthorized user tries to update', () => {
        it('Then throws ForbiddenError', async () => {
          const agent = anAgent({ organizationId });

          const mockDb = new MockDbBuilder()
            .mockResult([agent]) // SELECT agent by slug
            .build();

          const service = new AgentService(createMockDeps(mockDb));

          await expect(
            service.updateAgent('test-agent-a1b2', { bio: 'Hack attempt' }, userId)
          ).rejects.toThrow('Only the agent owner can update this profile');
        });
      });
    });
  });

  describe('createAgent', () => {
    describe('Given API key already has an agent linked', () => {
      describe('When createAgent is called with that API key', () => {
        it('Then throws ConflictError', async () => {
          const apiKeyId = crypto.randomUUID();
          const existingAgentId = crypto.randomUUID();

          const mockDb = new MockDbBuilder()
            .mockResult([]) // SELECT agent by slug — no slug conflict
            .mockResult([{ agentId: existingAgentId }]) // SELECT apiKey.agentId — already linked
            .build();

          const service = new AgentService(createMockDeps(mockDb));

          await expect(
            service.createAgent(
              { slug: 'new-agent', displayName: 'New Agent', isPublic: false },
              userId,
              organizationId,
              apiKeyId
            )
          ).rejects.toThrow('This API key is already linked to an agent');
        });
      });
    });

    describe('Given API key has no agent linked', () => {
      describe('When createAgent is called', () => {
        it('Then creates the agent and links the key', async () => {
          const apiKeyId = crypto.randomUUID();
          const newAgent = anAgent({ createdByUserId: userId, organizationId });

          const mockDb = new MockDbBuilder()
            .mockResult([]) // SELECT agent by slug — no conflict
            .mockResult([{ agentId: null }]) // SELECT apiKey.agentId — not linked
            .mockResult([newAgent]) // INSERT agent returning (inside transaction)
            .mockResult(undefined) // UPDATE apiKey set agentId (inside transaction)
            .mockResult([{ count: 0, activeOrgs: 0 }]) // aggregateStats: issue stats
            .mockResult([{ count: 0, accepted: 0, upvotes: 0 }]) // aggregateStats: solution stats
            .mockResult([{ count: 0 }]) // aggregateStats: comment count
            .mockResult([{ count: 0 }]) // aggregateStats: wiki pages created
            .mockResult([{ count: 0 }]) // aggregateStats: wiki edits
            .mockResult([{ count: 0 }]) // aggregateStats: sources ingested
            .mockResult([]) // aggregateStats: linked keys (trust)
            .mockResult([{ id: userId, name: 'Creator', image: null }]) // createdByUser
            .mockResult([{ name: 'Test Org' }]) // organizationName
            .build();

          const service = new AgentService(createMockDeps(mockDb));
          const result = await service.createAgent(
            { slug: 'new-agent', displayName: 'New Agent', isPublic: false },
            userId,
            organizationId,
            apiKeyId
          );

          expect(result).toBeDefined();
          expect(result.slug).toBe(newAgent.slug);
        });
      });
    });
  });

  describe('buildProfile isCreator and apiKeyInfo', () => {
    describe('Given agent is viewed by its creator', () => {
      describe('When creator views the profile', () => {
        it('Then isCreator is true and apiKeyInfo is populated when key exists', async () => {
          const agentId = crypto.randomUUID();
          const agent = anAgent({
            id: agentId,
            createdByUserId: userId,
            organizationId,
            isPublic: true,
          });

          const keyCreatedAt = new Date();
          const keyLastUsedAt = new Date();

          const mockDb = new MockDbBuilder()
            .mockResult([agent]) // SELECT agent by slug
            .mockResult([]) // fetchBadges
            .mockResult([{ count: 0, activeOrgs: 0 }]) // aggregateStats: issue stats
            .mockResult([{ count: 0, accepted: 0, upvotes: 0 }]) // aggregateStats: solution stats
            .mockResult([{ count: 0 }]) // aggregateStats: comment count
            .mockResult([{ count: 0 }]) // aggregateStats: wiki pages created
            .mockResult([{ count: 0 }]) // aggregateStats: wiki edits
            .mockResult([{ count: 0 }]) // aggregateStats: sources ingested
            .mockResult([]) // aggregateStats: linked keys (trust)
            .mockResult([{ id: userId, name: 'Creator', image: null }]) // createdByUser
            .mockResult([{ name: 'Test Org' }]) // organizationName
            .mockResult([
              {
                id: 'key-id',
                prefix: 'ask_prv_abc1',
                createdAt: keyCreatedAt,
                lastUsedAt: keyLastUsedAt,
              },
            ]) // getAgentApiKeyInfo
            .build();

          const service = new AgentService(createMockDeps(mockDb));
          const result = await service.getAgentBySlug('test-agent-a1b2', userId, organizationId);

          expect(result.isCreator).toBe(true);
          expect(result.apiKeyInfo).not.toBeNull();
          expect(result.apiKeyInfo?.id).toBe('key-id');
          expect(result.apiKeyInfo?.prefix).toBe('ask_prv_abc1');
        });
      });
    });

    describe('Given agent is viewed by a different user', () => {
      describe('When non-creator views the profile', () => {
        it('Then isCreator is false and apiKeyInfo is null', async () => {
          const agent = anAgent({
            organizationId,
            isPublic: true,
          });

          const mockDb = new MockDbBuilder()
            .mockResult([agent]) // SELECT agent by slug
            .mockResult([]) // fetchBadges
            .mockResult([{ count: 0, activeOrgs: 0 }]) // aggregateStats: issue stats
            .mockResult([{ count: 0, accepted: 0, upvotes: 0 }]) // aggregateStats: solution stats
            .mockResult([{ count: 0 }]) // aggregateStats: comment count
            .mockResult([{ count: 0 }]) // aggregateStats: wiki pages created
            .mockResult([{ count: 0 }]) // aggregateStats: wiki edits
            .mockResult([{ count: 0 }]) // aggregateStats: sources ingested
            .mockResult([]) // aggregateStats: linked keys (trust)
            .mockResult([{ id: agent.createdByUserId, name: 'Creator', image: null }]) // createdByUser
            .mockResult([{ name: 'Test Org' }]) // organizationName
            .build();

          const service = new AgentService(createMockDeps(mockDb));
          const result = await service.getAgentBySlug('test-agent-a1b2', userId, organizationId);

          expect(result.isCreator).toBe(false);
          expect(result.apiKeyInfo).toBeNull();
        });
      });
    });
  });

  describe('getAgentApiKeyInfo', () => {
    describe('Given agent has a linked API key', () => {
      it('Then returns key info', async () => {
        const agentId = crypto.randomUUID();
        const keyCreatedAt = new Date();

        const mockDb = new MockDbBuilder()
          .mockResult([
            {
              id: 'key-id',
              prefix: 'ask_pub_xyz',
              createdAt: keyCreatedAt,
              lastUsedAt: null,
            },
          ])
          .build();

        const service = new AgentService(createMockDeps(mockDb));
        const result = await service.getAgentApiKeyInfo(agentId);

        expect(result).not.toBeNull();
        expect(result?.id).toBe('key-id');
        expect(result?.prefix).toBe('ask_pub_xyz');
        expect(result?.createdAt).toBe(keyCreatedAt.toISOString());
        expect(result?.lastUsedAt).toBeNull();
      });
    });

    describe('Given agent has no linked API key', () => {
      it('Then returns null', async () => {
        const agentId = crypto.randomUUID();

        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new AgentService(createMockDeps(mockDb));
        const result = await service.getAgentApiKeyInfo(agentId);

        expect(result).toBeNull();
      });
    });
  });

  describe('createKeyForAgent', () => {
    describe('Given agent exists with no key and user is creator', () => {
      it('Then creates a new key via createApiKeyForAgent', async () => {
        const agentId = crypto.randomUUID();
        const agent = anAgent({
          id: agentId,
          createdByUserId: userId,
          organizationId,
        });

        const mockDb = new MockDbBuilder()
          .mockResult([agent]) // SELECT agent by slug
          .mockResult([]) // SELECT existing key - none
          .build();

        const service = new AgentService(createMockDeps(mockDb));
        const result = await service.createKeyForAgent('test-agent-a1b2', userId);

        expect(result.id).toBe('new-key-id');
        expect(result.key).toBe('ask_prv_abc123');
      });
    });

    describe('Given agent exists but already has a key', () => {
      it('Then throws ConflictError', async () => {
        const agentId = crypto.randomUUID();
        const agent = anAgent({
          id: agentId,
          createdByUserId: userId,
          organizationId,
        });

        const mockDb = new MockDbBuilder()
          .mockResult([agent]) // SELECT agent by slug
          .mockResult([{ id: 'existing-key' }]) // SELECT existing key - found
          .build();

        const service = new AgentService(createMockDeps(mockDb));

        await expect(service.createKeyForAgent('test-agent-a1b2', userId)).rejects.toThrow(
          'Agent already has an API key. Use regenerate instead.'
        );
      });
    });

    describe('Given user is not the creator', () => {
      it('Then throws ForbiddenError', async () => {
        const agent = anAgent({ organizationId });

        const mockDb = new MockDbBuilder()
          .mockResult([agent]) // SELECT agent by slug
          .build();

        const service = new AgentService(createMockDeps(mockDb));

        await expect(service.createKeyForAgent('test-agent-a1b2', userId)).rejects.toThrow(
          'Only the agent creator can manage API keys'
        );
      });
    });

    describe('Given agent does not exist', () => {
      it('Then throws NotFoundError', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new AgentService(createMockDeps(mockDb));

        await expect(service.createKeyForAgent('nonexistent-agent', userId)).rejects.toThrow(
          'Agent not found'
        );
      });
    });
  });

  describe('regenerateKey', () => {
    describe('Given agent exists and user is creator', () => {
      it('Then deletes old key and creates a new one', async () => {
        const agentId = crypto.randomUUID();
        const agent = anAgent({
          id: agentId,
          createdByUserId: userId,
          organizationId,
        });

        const mockDb = new MockDbBuilder()
          .mockResult([agent]) // SELECT agent by slug
          .mockResult(undefined) // DELETE old keys
          .build();

        const service = new AgentService(createMockDeps(mockDb));
        const result = await service.regenerateKey('test-agent-a1b2', userId);

        expect(result.id).toBe('new-key-id');
        expect(mockDb.delete).toHaveBeenCalled();
      });
    });

    describe('Given user is not the creator', () => {
      it('Then throws ForbiddenError', async () => {
        const agent = anAgent({ organizationId });

        const mockDb = new MockDbBuilder()
          .mockResult([agent]) // SELECT agent by slug
          .build();

        const service = new AgentService(createMockDeps(mockDb));

        await expect(service.regenerateKey('test-agent-a1b2', userId)).rejects.toThrow(
          'Only the agent creator can manage API keys'
        );
      });
    });
  });
});
