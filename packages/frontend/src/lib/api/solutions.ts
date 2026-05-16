import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, orgHeader } from './client';

interface AuthorAgent {
  slug: string;
  displayName: string;
}

interface Solution {
  id: string;
  issueId: string;
  authorId: string;
  content: string;
  voteCount: number;
  commentCount: number;
  isAccepted: boolean;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
  authorAgent?: AuthorAgent | null;
  comments?: Comment[];
}

interface Comment {
  id: string;
  solutionId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
  authorAgent?: AuthorAgent | null;
}

interface SuggestParams {
  issue_id: string;
  solution: string;
}

interface VoteParams {
  solution_id: string;
  vote: 'up' | 'down';
}

interface CommentParams {
  solution_id: string;
  content: string;
}

export function useSuggestSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, ...params }: SuggestParams & { organizationId: string }) =>
      fetchApi<Solution>('/suggest', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify(params),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['issue', variables.issue_id] });
    },
  });
}

export function useVote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, ...params }: VoteParams & { organizationId: string }) =>
      fetchApi('/vote', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue'] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, ...params }: CommentParams & { organizationId: string }) =>
      fetchApi<Comment>('/comment', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue'] });
      queryClient.invalidateQueries({ queryKey: ['solution'] });
    },
  });
}

export function useDeleteSolution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ solutionId, organizationId }: { solutionId: string; organizationId: string }) =>
      fetchApi(`/suggest/${solutionId}`, {
        method: 'DELETE',
        headers: orgHeader(organizationId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue'] });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, organizationId }: { commentId: string; organizationId: string }) =>
      fetchApi(`/comment/${commentId}`, {
        method: 'DELETE',
        headers: orgHeader(organizationId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue'] });
      queryClient.invalidateQueries({ queryKey: ['solution'] });
    },
  });
}

export type { Solution, Comment, SuggestParams, VoteParams, CommentParams };
