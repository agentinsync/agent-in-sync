import { describe, it, expect } from 'vitest';
import { SuggestService } from './suggest.service.js';
import {
  MockDbBuilder,
  createMockDeps,
  createMockWeaviateClient,
  createMockWeaviateCollection,
} from '../test-utils/mocks.js';
import { anIssue, aSolution } from '../test-utils/builders.js';

describe('SuggestService', () => {
  const userId = crypto.randomUUID();
  const issueId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();

  describe('suggest', () => {
    describe('Given an issue does not exist', () => {
      it('Then throws ISSUE_NOT_FOUND error', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new SuggestService(createMockDeps(mockDb));

        await expect(
          service.suggest(
            { issue_id: issueId, suggestion: 'My suggestion content' },
            userId,
            organizationId
          )
        ).rejects.toThrow('ISSUE_NOT_FOUND');
      });
    });

    describe('Given an issue exists', () => {
      describe('When user suggests a solution', () => {
        it('Then creates the solution and returns solution_id', async () => {
          const issue = anIssue().withId(issueId).withTitle('Test Issue Title').build();
          const newSolution = aSolution().withIssueId(issueId).withAuthorId(userId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: issue.id, title: issue.title, organizationId }])
            .mockResult([{ id: newSolution.id }])
            .mockResult(undefined)
            .mockResult([])
            .build();

          const service = new SuggestService(createMockDeps(mockDb));
          const result = await service.suggest(
            { issue_id: issueId, suggestion: 'Here is my solution to the problem' },
            userId,
            organizationId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.solution_id).toBe(newSolution.id);
        });

        it('Then increments the issue solution count', async () => {
          const issue = anIssue().withId(issueId).build();
          const newSolution = aSolution().build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: issue.id, title: issue.title, organizationId }])
            .mockResult([{ id: newSolution.id }])
            .mockResult(undefined)
            .mockResult([])
            .build();

          const service = new SuggestService(createMockDeps(mockDb));
          await service.suggest(
            { issue_id: issueId, suggestion: 'Here is my solution to the problem' },
            userId,
            organizationId
          );

          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given an issue exists with tags', () => {
      describe('When user suggests a solution', () => {
        it('Then indexes the solution in Weaviate with issue tags', async () => {
          const issue = anIssue().withId(issueId).withTitle('Test Issue').build();
          const newSolution = aSolution().withIssueId(issueId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: issue.id, title: issue.title, organizationId }])
            .mockResult([{ id: newSolution.id }])
            .mockResult(undefined)
            .mockResult([{ name: 'typescript' }, { name: 'react' }])
            .build();

          const mockCollection = createMockWeaviateCollection();
          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SuggestService(createMockDeps(mockDb, mockWeaviateClient));

          await service.suggest(
            { issue_id: issueId, suggestion: 'Here is my solution to the problem' },
            userId,
            organizationId
          );

          expect(mockCollection.data.insert).toHaveBeenCalledWith(
            expect.objectContaining({
              solutionId: newSolution.id,
              issueId: issueId,
              title: issue.title,
              tags: ['typescript', 'react'],
              voteCount: 0,
            })
          );
        });
      });
    });

    describe('Given user suggests with agentId', () => {
      describe('When user suggests a solution with agentId', () => {
        it('Then passes agentId through to the solution insert', async () => {
          const agentId = crypto.randomUUID();
          const issue = anIssue().withId(issueId).withTitle('Test Issue Title').build();
          const newSolution = aSolution().withIssueId(issueId).withAuthorId(userId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: issue.id, title: issue.title, organizationId }])
            .mockResult([{ id: newSolution.id }])
            .mockResult(undefined)
            .mockResult([])
            .build();

          const service = new SuggestService(createMockDeps(mockDb));
          const result = await service.suggest(
            { issue_id: issueId, suggestion: 'Here is my solution to the problem' },
            userId,
            organizationId,
            undefined,
            agentId
          );

          expect(result.solution_id).toBe(newSolution.id);
          expect(mockDb.values).toHaveBeenCalledWith(
            expect.objectContaining({ authorAgentId: agentId })
          );
        });
      });
    });

    describe('Given Weaviate indexing fails', () => {
      describe('When user suggests a solution', () => {
        it('Then still succeeds and returns solution_id (graceful degradation)', async () => {
          const issue = anIssue().withId(issueId).withTitle('Test Issue').build();
          const newSolution = aSolution().build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: issue.id, title: issue.title, organizationId }])
            .mockResult([{ id: newSolution.id }])
            .mockResult(undefined)
            .mockResult([])
            .build();

          const mockCollection = createMockWeaviateCollection();
          mockCollection.data.insert.mockRejectedValue(new Error('Weaviate connection failed'));

          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SuggestService(createMockDeps(mockDb, mockWeaviateClient));

          const result = await service.suggest(
            { issue_id: issueId, suggestion: 'Solution despite Weaviate being down' },
            userId,
            organizationId
          );

          expect(result.solution_id).toBe(newSolution.id);
        });
      });
    });
  });
});
