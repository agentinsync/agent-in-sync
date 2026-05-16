import { describe, it, expect } from 'vitest';
import { SubmitService } from './submit.service.js';
import {
  MockDbBuilder,
  createMockDeps,
  createMockWeaviateClient,
  createMockWeaviateCollection,
} from '../test-utils/mocks.js';
import { anIssue, aSolution, aTag } from '../test-utils/builders.js';

describe('SubmitService', () => {
  const userId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();

  describe('submit', () => {
    describe('Given tags do not exist', () => {
      describe('When user submits an issue without solution', () => {
        it('Then creates new tags for each tag name', async () => {
          const newIssue = anIssue()
            .withOrganizationId(organizationId)
            .withAuthorId(userId)
            .build();
          const tag1 = aTag().withName('typescript').build();
          const tag2 = aTag().withName('nodejs').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([]) // SELECT existing tags - none exist
            .mockResult(undefined) // INSERT new tags (bulk)
            .mockResult([
              { id: tag1.id, name: 'typescript' },
              { id: tag2.id, name: 'nodejs' },
            ]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['TypeScript', 'NodeJS'],
            },
            userId,
            organizationId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.issue_id).toBe(newIssue.id);
          expect(result.solution_id).toBeUndefined();
        });
      });
    });

    describe('Given tags already exist', () => {
      describe('When user submits an issue with existing tag', () => {
        it('Then increments the tag usage count instead of creating new', async () => {
          const newIssue = anIssue().build();
          const existingTag = aTag().withName('typescript').withUsageCount(5).build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([{ id: existingTag.id, name: existingTag.name }]) // SELECT existing tags - found
            .mockResult(undefined) // UPDATE usage count (bulk)
            .mockResult([{ id: existingTag.id, name: existingTag.name }]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['typescript'],
            },
            userId,
            organizationId
          );

          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given user submits with a solution', () => {
      describe('When user submits an issue with solution', () => {
        it('Then creates both issue and solution', async () => {
          const newIssue = anIssue().build();
          const newSolution = aSolution().withIssueId(newIssue.id).build();
          const tag = aTag().withName('react').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([]) // SELECT existing tags - none
            .mockResult(undefined) // INSERT new tags
            .mockResult([{ id: tag.id, name: 'react' }]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .mockResult([{ id: newSolution.id }]) // INSERT solution
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['react'],
              solution: 'Here is my solution to the problem',
            },
            userId,
            organizationId
          );

          expect(result.issue_id).toBe(newIssue.id);
          expect(result.solution_id).toBe(newSolution.id);
        });

        it('Then indexes the solution in Weaviate', async () => {
          const newIssue = anIssue().build();
          const newSolution = aSolution().withIssueId(newIssue.id).build();
          const tag = aTag().withName('react').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([]) // SELECT existing tags - none
            .mockResult(undefined) // INSERT new tags
            .mockResult([{ id: tag.id, name: 'react' }]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .mockResult([{ id: newSolution.id }]) // INSERT solution
            // fetchDisplayFields (parallel: user, org)
            .mockResult([{ name: 'Test User' }]) // SELECT user
            .mockResult([{ name: 'Test Org' }]) // SELECT organization
            .mockResult(undefined) // UPDATE solution weaviateIndexedAt
            .build();

          const mockCollection = createMockWeaviateCollection();
          const mockWeaviateClient = createMockWeaviateClient(mockCollection);
          const service = new SubmitService(createMockDeps(mockDb, mockWeaviateClient));

          await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['React'],
              solution: 'Here is my solution to the problem',
            },
            userId,
            organizationId
          );

          expect(mockCollection.data.insert).toHaveBeenCalledWith(
            expect.objectContaining({
              solutionId: newSolution.id,
              issueId: newIssue.id,
              tags: ['react'],
              voteCount: 0,
              authorName: 'Test User',
              organizationName: 'Test Org',
              isAccepted: false,
              authorTrustLevel: 'new',
            })
          );
        });
      });
    });

    describe('Given multiple tags with mixed existence', () => {
      describe('When user submits with both existing and new tags', () => {
        it('Then processes all tags correctly (bulk operations)', async () => {
          const newIssue = anIssue().build();
          const existingTag = aTag().withName('typescript').build();
          const newTag = aTag().withName('graphql').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([{ id: existingTag.id, name: existingTag.name }]) // SELECT existing tags - found typescript
            .mockResult(undefined) // INSERT new tag (graphql)
            .mockResult(undefined) // UPDATE usage count for existing
            .mockResult([
              { id: existingTag.id, name: 'typescript' },
              { id: newTag.id, name: 'graphql' },
            ]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['typescript', 'graphql'],
            },
            userId,
            organizationId
          );

          expect(result.issue_id).toBe(newIssue.id);
        });
      });
    });

    describe('Given user submits with agentId', () => {
      describe('When user submits an issue with agentId', () => {
        it('Then passes agentId through to the insert call', async () => {
          const agentId = crypto.randomUUID();
          const newIssue = anIssue().build();
          const tag = aTag().withName('react').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([]) // SELECT existing tags - none
            .mockResult(undefined) // INSERT new tags
            .mockResult([{ id: tag.id, name: 'react' }]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['react'],
            },
            userId,
            organizationId,
            undefined,
            agentId
          );

          expect(result.issue_id).toBe(newIssue.id);
          expect(mockDb.values).toHaveBeenCalledWith(
            expect.objectContaining({ authorAgentId: agentId })
          );
        });
      });

      describe('When user submits an issue with solution and agentId', () => {
        it('Then both issue and solution have authorAgentId set', async () => {
          const agentId = crypto.randomUUID();
          const newIssue = anIssue().build();
          const newSolution = aSolution().withIssueId(newIssue.id).build();
          const tag = aTag().withName('react').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([]) // SELECT existing tags - none
            .mockResult(undefined) // INSERT new tags
            .mockResult([{ id: tag.id, name: 'react' }]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .mockResult([{ id: newSolution.id }]) // INSERT solution
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['react'],
              solution: 'Here is my solution to the problem',
            },
            userId,
            organizationId,
            undefined,
            agentId
          );

          expect(result.issue_id).toBe(newIssue.id);
          expect(result.solution_id).toBe(newSolution.id);
          // values() is called for issue, issueTags, and solution — all should include agentId
          const valuesCallArgs = mockDb.values!.mock.calls;
          const issueCall = valuesCallArgs.find(
            (call: unknown[]) =>
              call[0] && typeof call[0] === 'object' && 'authorAgentId' in call[0]
          );
          expect(issueCall).toBeDefined();
          expect(issueCall![0].authorAgentId).toBe(agentId);
        });
      });
    });

    describe('Given tag names with different casing and whitespace', () => {
      describe('When user submits with tag " TypeScript "', () => {
        it('Then normalizes to lowercase and trimmed', async () => {
          const newIssue = anIssue().build();
          const tag = aTag().withName('typescript').build();

          const mockDb = new MockDbBuilder()
            // Duplicate detection queries
            .mockResult([]) // SELECT public organization - none
            .mockResult([]) // SELECT by contentHash - no exact match
            // Tag queries
            .mockResult([]) // SELECT existing tags - none
            .mockResult(undefined) // INSERT new tags
            .mockResult([{ id: tag.id, name: 'typescript' }]) // SELECT all tags for IDs
            .mockResult([{ id: newIssue.id }]) // INSERT issue
            .mockResult(undefined) // INSERT issueTags
            .build();

          const service = new SubmitService(createMockDeps(mockDb));

          await service.submit(
            {
              title: 'Test Issue Title Here',
              summary: 'Test issue causing failures in the system due to incorrect configuration.',
              description: 'This is a test description for the issue',
              tags: ['  TypeScript  '],
            },
            userId,
            organizationId
          );

          expect(mockDb.insert).toHaveBeenCalled();
        });
      });
    });
  });

  describe('getIssue', () => {
    describe('Given issue exists', () => {
      describe('When fetching issue by id', () => {
        it('Then returns the issue with authorId', async () => {
          const issue = anIssue().withAuthorId(userId).withOrganizationId(organizationId).build();

          const mockDb = new MockDbBuilder().mockResult([issue]).build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.getIssue(issue.id);

          expect(result).not.toBeNull();
          expect(result?.id).toBe(issue.id);
          expect(result?.authorId).toBe(userId);
          expect(result?.organizationId).toBe(organizationId);
        });
      });
    });

    describe('Given issue does not exist', () => {
      describe('When fetching issue by id', () => {
        it('Then returns null', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.getIssue(crypto.randomUUID());

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('getSolution', () => {
    describe('Given solution exists', () => {
      describe('When fetching solution by id', () => {
        it('Then returns the solution with authorId', async () => {
          const issueId = crypto.randomUUID();
          const solution = aSolution().withAuthorId(userId).withIssueId(issueId).build();

          const mockDb = new MockDbBuilder().mockResult([solution]).build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.getSolution(solution.id);

          expect(result).not.toBeNull();
          expect(result?.id).toBe(solution.id);
          expect(result?.authorId).toBe(userId);
          expect(result?.issueId).toBe(issueId);
        });
      });
    });

    describe('Given solution does not exist', () => {
      describe('When fetching solution by id', () => {
        it('Then returns null', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.getSolution(crypto.randomUUID());

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('deleteIssue', () => {
    describe('Given issue exists', () => {
      describe('When deleting the issue', () => {
        it('Then returns true and deletes the issue', async () => {
          const issue = anIssue().build();

          const mockDb = new MockDbBuilder()
            .mockResult([issue])
            .mockResult([])
            .mockResult(undefined)
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.deleteIssue(issue.id);

          expect(result).toBe(true);
          expect(mockDb.delete).toHaveBeenCalled();
        });
      });

      describe('When issue has solutions indexed in Weaviate', () => {
        it('Then deletes solutions from Weaviate first', async () => {
          const issue = anIssue().build();
          const solution = aSolution().withIssueId(issue.id).build();

          const mockDb = new MockDbBuilder()
            .mockResult([issue])
            .mockResult([{ id: solution.id }])
            .mockResult(undefined)
            .build();

          const mockCollection = createMockWeaviateCollection();
          const mockWeaviateClient = createMockWeaviateClient(mockCollection);

          const service = new SubmitService(createMockDeps(mockDb, mockWeaviateClient));
          const result = await service.deleteIssue(issue.id);

          expect(result).toBe(true);
          expect(mockCollection.data.deleteById).toHaveBeenCalledWith(solution.id);
        });
      });
    });

    describe('Given issue does not exist', () => {
      describe('When trying to delete', () => {
        it('Then returns false', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.deleteIssue(crypto.randomUUID());

          expect(result).toBe(false);
        });
      });
    });
  });

  describe('deleteSolution', () => {
    describe('Given solution exists', () => {
      describe('When deleting the solution', () => {
        it('Then returns true and updates issue solution count', async () => {
          const issueId = crypto.randomUUID();
          const solution = aSolution().withIssueId(issueId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: solution.id, issueId }])
            .mockResult(undefined)
            .mockResult(undefined)
            .build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.deleteSolution(solution.id);

          expect(result).toBe(true);
          expect(mockDb.delete).toHaveBeenCalled();
          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given solution does not exist', () => {
      describe('When trying to delete', () => {
        it('Then returns false', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new SubmitService(createMockDeps(mockDb));
          const result = await service.deleteSolution(crypto.randomUUID());

          expect(result).toBe(false);
        });
      });
    });
  });
});
