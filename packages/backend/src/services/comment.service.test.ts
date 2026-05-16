import { describe, it, expect } from 'vitest';
import { CommentService } from './comment.service.js';
import { MockDbBuilder, createMockDeps } from '../test-utils/mocks.js';
import { aSolution, aComment } from '../test-utils/builders.js';

describe('CommentService', () => {
  const userId = crypto.randomUUID();
  const solutionId = crypto.randomUUID();
  const organizationId = crypto.randomUUID();

  describe('addComment', () => {
    describe('Given a solution does not exist', () => {
      it('Then throws SOLUTION_NOT_FOUND error', async () => {
        const mockDb = new MockDbBuilder().mockResult([]).build();

        const service = new CommentService(createMockDeps(mockDb));

        await expect(
          service.addComment(
            { solution_id: solutionId, comment: 'Test comment' },
            userId,
            organizationId
          )
        ).rejects.toThrow('SOLUTION_NOT_FOUND');
      });
    });

    describe('Given a solution exists', () => {
      describe('When user adds a comment', () => {
        it('Then creates the comment and returns comment_id', async () => {
          const solution = aSolution().withId(solutionId).build();
          const newComment = aComment().withSolutionId(solutionId).withAuthorId(userId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: solution.id, issueOrgId: organizationId }])
            .mockResult([{ id: newComment.id }])
            .mockResult(undefined)
            .build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.addComment(
            { solution_id: solutionId, comment: 'This is a helpful comment' },
            userId,
            organizationId
          );

          expect(mockDb.insert).toHaveBeenCalled();
          expect(result.comment_id).toBe(newComment.id);
        });

        it('Then increments the solution comment count', async () => {
          const solution = aSolution().withId(solutionId).build();
          const newComment = aComment().build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: solution.id, issueOrgId: organizationId }])
            .mockResult([{ id: newComment.id }])
            .mockResult(undefined)
            .build();

          const service = new CommentService(createMockDeps(mockDb));
          await service.addComment(
            { solution_id: solutionId, comment: 'This is a helpful comment' },
            userId,
            organizationId
          );

          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given a solution exists with zero comments', () => {
      describe('When user adds the first comment', () => {
        it('Then successfully creates the comment', async () => {
          const solution = aSolution().withId(solutionId).withCommentCount(0).build();
          const newComment = aComment().build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: solution.id, issueOrgId: organizationId }])
            .mockResult([{ id: newComment.id }])
            .mockResult(undefined)
            .build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.addComment(
            { solution_id: solutionId, comment: 'First comment!' },
            userId,
            organizationId
          );

          expect(result.comment_id).toBe(newComment.id);
        });
      });
    });
  });

  describe('addComment with agentId', () => {
    describe('Given a solution exists', () => {
      describe('When user adds a comment with agentId', () => {
        it('Then passes agentId through to the comment insert', async () => {
          const agentId = crypto.randomUUID();
          const solution = aSolution().withId(solutionId).build();
          const newComment = aComment().withSolutionId(solutionId).withAuthorId(userId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ id: solution.id, issueOrgId: organizationId }])
            .mockResult([{ id: newComment.id }])
            .mockResult(undefined)
            .build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.addComment(
            { solution_id: solutionId, comment: 'This is a helpful comment' },
            userId,
            organizationId,
            undefined,
            agentId
          );

          expect(result.comment_id).toBe(newComment.id);
          expect(mockDb.values).toHaveBeenCalledWith(
            expect.objectContaining({ authorAgentId: agentId })
          );
        });
      });
    });
  });

  describe('getComment', () => {
    describe('Given comment exists', () => {
      describe('When fetching comment by id', () => {
        it('Then returns the comment with authorId', async () => {
          const comment = aComment().withSolutionId(solutionId).withAuthorId(userId).build();

          const mockDb = new MockDbBuilder().mockResult([comment]).build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.getComment(comment.id);

          expect(result).not.toBeNull();
          expect(result?.id).toBe(comment.id);
          expect(result?.authorId).toBe(userId);
          expect(result?.solutionId).toBe(solutionId);
        });
      });
    });

    describe('Given comment does not exist', () => {
      describe('When fetching comment by id', () => {
        it('Then returns null', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.getComment(crypto.randomUUID());

          expect(result).toBeNull();
        });
      });
    });
  });

  describe('deleteComment', () => {
    describe('Given comment exists', () => {
      describe('When deleting the comment', () => {
        it('Then returns true and decrements solution comment count', async () => {
          const comment = aComment().withSolutionId(solutionId).build();

          const mockDb = new MockDbBuilder()
            .mockResult([{ solutionId }])
            .mockResult(undefined)
            .mockResult(undefined)
            .build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.deleteComment(comment.id);

          expect(result).toBe(true);
          expect(mockDb.delete).toHaveBeenCalled();
          expect(mockDb.update).toHaveBeenCalled();
        });
      });
    });

    describe('Given comment does not exist', () => {
      describe('When trying to delete', () => {
        it('Then returns false', async () => {
          const mockDb = new MockDbBuilder().mockResult([]).build();

          const service = new CommentService(createMockDeps(mockDb));
          const result = await service.deleteComment(crypto.randomUUID());

          expect(result).toBe(false);
        });
      });
    });
  });
});
