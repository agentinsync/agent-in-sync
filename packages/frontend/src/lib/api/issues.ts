import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, orgHeader } from './client';
import type { Solution } from './solutions';

interface Tag {
  id: string;
  name: string;
}

interface PackageInfo {
  name: string;
  version: string;
}

interface AuthorAgent {
  slug: string;
  displayName: string;
}

interface Issue {
  id: string;
  title: string;
  summary?: string;
  description: string;
  authorId: string;
  solutionCount: number;
  acceptedSolutionId: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  author?: {
    id: string;
    name: string | null;
    email: string;
  };
  authorAgent?: AuthorAgent | null;
  errorType?: string | null;
  severity?: string | null;
  environment?: string | null;
  affectedArea?: string | null;
  rootCause?: string | null;
  complexity?: string | null;
  packages?: PackageInfo[] | null;
  techStack?: string[] | null;
  project?: string | null;
  frequency?: string | null;
  fixType?: string | null;
  hasMinimalRepro?: boolean | null;
  timeToResolve?: string | null;
  originOrganizationId?: string | null;
}

interface SearchResult {
  solution_id: string;
  issue_id: string;
  title: string;
  summary: string;
  votes: number;
  timestamp: string;
  tags: string[];
  author_name: string | null;
  author_agent_slug: string | null;
  author_agent_name: string | null;
  organization_name: string | null;
  is_accepted: boolean;
  author_trust_level: string;
  relevance?: number | null;
  rank_score?: number;
  metadata?: {
    project?: string | null;
    techStack?: string[] | null;
    errorType?: string | null;
    severity?: string | null;
    complexity?: string | null;
  };
}

interface SearchParams {
  query?: string;
  tags?: string[];
  search_type?: 'vector' | 'hybrid';
  sort_order?: 'relevance' | 'votes' | 'recent' | 'complexity' | 'severity';
  limit?: number;
  offset?: number;
  errorType?: string;
  severity?: string;
  environment?: string;
  affectedArea?: string;
  rootCause?: string;
  maxComplexity?: string;
  project?: string;
  techStack?: string[];
  frequency?: string;
  fixType?: string;
  packages?: { name: string; version?: string; versionMatch?: string }[];
}

interface SearchResponse {
  results: Issue[];
  hasMore: boolean;
}

interface SearchResultResponse {
  results: SearchResult[];
  hasMore: boolean;
}

interface SubmitParams {
  title: string;
  summary: string;
  description: string;
  tags?: string[];
  solution?: string;
}

export function useSearch(params: SearchParams, organizationId: string | undefined) {
  return useQuery({
    queryKey: ['search', params, organizationId],
    queryFn: () =>
      fetchApi<SearchResponse>('/search', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify(params),
      }),
    enabled:
      !!organizationId && (params.query !== undefined || (params.tags && params.tags.length > 0)),
  });
}

export function useSearchResults(params: SearchParams, organizationId: string | undefined) {
  return useQuery({
    queryKey: ['search', params, organizationId],
    queryFn: () =>
      fetchApi<SearchResultResponse>('/search', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify(params),
      }),
    enabled:
      !!organizationId &&
      (queryMeetsMinLength(params.query) ||
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
        (params.techStack && params.techStack.length > 0)),
  });
}

export function useIssues(organizationId: string | undefined, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['issues', organizationId, limit, offset],
    queryFn: () =>
      fetchApi<SearchResponse>('/search', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ search_type: 'hybrid', limit, offset }),
      }),
    enabled: !!organizationId,
  });
}

export function useRecentIssues(organizationId: string | undefined, limit = 6) {
  return useQuery({
    queryKey: ['recent-issues', organizationId, limit],
    queryFn: () =>
      fetchApi<SearchResultResponse>('/search', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ search_type: 'hybrid', sort_order: 'recent', limit }),
      }),
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useIssue(issueId: string, organizationId: string | undefined) {
  return useQuery({
    queryKey: ['issue', issueId, organizationId],
    queryFn: () =>
      fetchApi<{ issue: Issue; solutions: Solution[] }>('/search', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ issue_id: issueId }),
      }),
    enabled: !!issueId && !!organizationId,
  });
}

export function useSubmitIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, ...params }: SubmitParams & { organizationId: string }) =>
      fetchApi<Issue>('/submit', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, organizationId }: { issueId: string; organizationId: string }) =>
      fetchApi(`/submit/${issueId}`, {
        method: 'DELETE',
        headers: orgHeader(organizationId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export interface FacetsResponse {
  projects: string[];
  techStack: string[];
  tags: string[];
  errorTypes: string[];
  severities: string[];
  environments: string[];
  affectedAreas: string[];
  frequencies: string[];
  rootCauses: string[];
  fixTypes: string[];
  complexities: string[];
}

export function useFacets(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['facets', organizationId],
    queryFn: () =>
      fetchApi<FacetsResponse>('/search/facets', {
        headers: orgHeader(organizationId),
      }),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export type {
  Tag,
  Issue,
  SearchResult,
  SearchParams,
  SearchResponse,
  SearchResultResponse,
  SubmitParams,
  PackageInfo,
};

const MIN_QUERY_LENGTH = 3;

function queryMeetsMinLength(query: string | undefined): boolean {
  return query !== undefined && query.length >= MIN_QUERY_LENGTH;
}
