import { describe, it, expect } from 'vitest';
import { VoteService } from './vote.service.js';
import {
  createMockDb,
  createMockDeps,
  createMockWeaviateClient,
  createMockWeaviateCollection,
} from '../test-utils/mocks.js';
import { aSolution, aVote } from '../test-utils/builders.js';

describe('VoteService', () => {
  const userId = crypto.randomUUID();
  const solutionId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();

  describe('vote', () => {
    describe('Given a solution does not exist', () => {
      it('Then throws SOLUTION_NOT_FOUND error', async () => {
        const mockDb = createMockDb();
        mockDb.limit.mockResolvedValue([]);

        const service = new VoteService(createMockDeps(mockDb));

        await expect(
          service.vote({ solution_id: solutionId, vote: 'up' }, userId, organizationId)
        ).rejects.toThrow('SOLUTION_NOT_FOUND');
      });
    });

    describe('Given a solution exists and user has no prior vote', () => {
      describe('When user upvotes', () => {
        it('Then creates a new upvote and returns incremented vote count', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 6 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'up' },
            userId,
            organizationId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(6);
        });
      });

      describe('When user downvotes', () => {
        it('Then creates a new downvote and returns decremented vote count', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 4 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'down' },
            userId,
            organizationId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(4);
        });
      });
    });

    describe('Given user has an existing upvote', () => {
      describe('When user upvotes again (toggle off)', () => {
        it('Then removes the vote with -1 change', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();
          const existingVote = aVote()
            .withSolutionId(solutionId)
            .withUserId(userId)
            .withDirection('up')
            .build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([{ id: existingVote.id, direction: 'up' }]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 4 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'up' },
            userId,
            organizationId
          );

          expect(mockDb.delete).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(4);
        });
      });

      describe('When user downvotes (flip direction)', () => {
        it('Then flips vote direction with -2 change', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();
          const existingVote = aVote().withDirection('up').build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([{ id: existingVote.id, direction: 'up' }]);
          });
          mockDb.set.mockReturnThis();
          mockDb.returning.mockResolvedValue([{ voteCount: 3 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'down' },
            userId,
            organizationId
          );

          expect(mockDb.update).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(3);
        });
      });
    });

    describe('Given user has an existing downvote', () => {
      describe('When user downvotes again (toggle off)', () => {
        it('Then removes the vote with +1 change', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();
          const existingVote = aVote().withDirection('down').build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([{ id: existingVote.id, direction: 'down' }]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 6 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'down' },
            userId,
            organizationId
          );

          expect(mockDb.delete).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(6);
        });
      });

      describe('When user upvotes (flip direction)', () => {
        it('Then flips vote direction with +2 change', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();
          const existingVote = aVote().withDirection('down').build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([{ id: existingVote.id, direction: 'down' }]);
          });
          mockDb.set.mockReturnThis();
          mockDb.returning.mockResolvedValue([{ voteCount: 7 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'up' },
            userId,
            organizationId
          );

          expect(mockDb.update).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(7);
        });
      });
    });

    describe('Given user votes with agentId', () => {
      describe('When user upvotes with agentId', () => {
        it('Then passes agentId through to the vote insert', async () => {
          const agentId = crypto.randomUUID();
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 6 }]);

          const service = new VoteService(createMockDeps(mockDb));
          const result = await service.vote(
            { solution_id: solutionId, vote: 'up' },
            userId,
            organizationId,
            undefined,
            agentId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.new_vote_count).toBe(6);
          expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({ agentId }));
        });
      });
    });

    describe('Given Weaviate has the solution indexed', () => {
      describe('When user votes', () => {
        it('Then updates Weaviate vote count', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();
          const weaviateUuid = crypto.randomUUID();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 6 }]);

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockResolvedValue({
            objects: [{ uuid: weaviateUuid, properties: { solutionId } }],
          });

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new VoteService(createMockDeps(mockDb, mockWeaviateClient));

          await service.vote({ solution_id: solutionId, vote: 'up' }, userId, organizationId);

          expect(mockCollection.data.update).toHaveBeenCalledWith({
            id: weaviateUuid,
            properties: { voteCount: 6 },
          });
        });
      });
    });

    describe('Given Weaviate update fails', () => {
      describe('When user votes', () => {
        it('Then succeeds without throwing (graceful degradation)', async () => {
          const mockDb = createMockDb();
          const solution = aSolution().withId(solutionId).withVoteCount(5).build();

          let limitCallCount = 0;
          mockDb.limit.mockImplementation(() => {
            limitCallCount++;
            if (limitCallCount === 1)
              return Promise.resolve([
                { id: solution.id, voteCount: solution.voteCount, issueOrgId: organizationId },
              ]);
            return Promise.resolve([]);
          });
          mockDb.returning.mockResolvedValue([{ voteCount: 6 }]);

          const mockCollection = createMockWeaviateCollection();
          mockCollection.query.fetchObjects.mockRejectedValue(new Error('Weaviate error'));

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new VoteService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.vote(
            { solution_id: solutionId, vote: 'up' },
            userId,
            organizationId
          );

          expect(result.new_vote_count).toBe(6);
        });
      });
    });
  });
});
