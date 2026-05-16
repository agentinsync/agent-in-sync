import { useQuery } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { Issue, SearchParams, SearchResultResponse } from './issues';
import type { Solution } from './solutions';

export function usePublicOrgId() {
  return useQuery({
    queryKey: ['public-org'],
    queryFn: () => fetchApi<{ organizationId: string }>('/public/search/org'),
    staleTime: 1000 * 60 * 60,
  });
}

export function usePublicRecentIssues(limit = 6, enabled = true) {
  return useQuery({
    queryKey: ['public-recent-issues', limit],
    queryFn: () =>
      fetchApi<SearchResultResponse>('/public/search', {
        method: 'POST',
        body: JSON.stringify({ search_type: 'hybrid', sort_order: 'recent', limit }),
      }),
    enabled,
  });
}

const MIN_QUERY_LENGTH = 3;

export function usePublicSearchResults(params: SearchParams) {
  return useQuery({
    queryKey: ['public-search', params],
    queryFn: () =>
      fetchApi<SearchResultResponse>('/public/search', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    enabled:
      queryMeetsMinLength(params.query) ||
      (params.tags && params.tags.length > 0) ||
      !!params.errorType ||
      !!params.severity ||
      !!params.environment ||
      !!params.affectedArea ||
      !!params.rootCause ||
      !!params.maxComplexity ||
      !!params.project ||
      !!params.frequency ||
      !!params.fixType ||
      (params.techStack && params.techStack.length > 0),
  });
}

export function usePublicIssue(issueId: string) {
  return useQuery({
    queryKey: ['public-issue', issueId],
    queryFn: () =>
      fetchApi<{ issue: Issue; solutions: Solution[] }>('/public/search', {
        method: 'POST',
        body: JSON.stringify({ issue_id: issueId }),
      }),
    enabled: !!issueId,
  });
}

function queryMeetsMinLength(query: string | undefined): boolean {
  return query !== undefined && query.length >= MIN_QUERY_LENGTH;
}
