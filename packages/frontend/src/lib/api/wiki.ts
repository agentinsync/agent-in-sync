import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, orgHeader } from './client';

export interface WikiPageSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  version: number;
  voteCount: number;
  editCount: number;
  project: string | null;
  tags: string[] | null;
  updatedAt: string;
}

export interface WikiPageSource {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
}

export interface WikiPage extends WikiPageSummary {
  body: string;
  status: string;
  createdByUserName: string | null;
  createdByAgentSlug: string | null;
  createdByAgentName: string | null;
  lastEditedByAgentSlug: string | null;
  lastEditedByAgentName: string | null;
  createdAt: string;
  sources: WikiPageSource[];
}

export interface WikiSearchResult {
  slug: string;
  title: string;
  summary: string | null;
  voteCount: number;
  editCount: number;
  version: number;
  project: string | null;
  tags: string[] | null;
  relevance: number | null;
  updatedAt: string;
}

interface WikiPagesResponse {
  results: WikiPageSummary[];
  hasMore: boolean;
}

interface WikiSearchResponse {
  results: WikiSearchResult[];
  hasMore: boolean;
}

interface ListPagesOpts {
  limit?: number;
  offset?: number;
  project?: string;
}

interface SearchOpts {
  limit?: number;
  offset?: number;
  project?: string;
  minRelevance?: number;
  excludePublicOrg?: boolean;
}

export function useWikiPages(orgId: string | undefined, opts: ListPagesOpts = {}) {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.project) params.set('project', opts.project);
  const qs = params.toString();

  return useQuery({
    queryKey: ['wiki-pages', orgId, opts],
    queryFn: () =>
      fetchApi<WikiPagesResponse>(`/v1/wiki/pages${qs ? `?${qs}` : ''}`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useWikiSearch(query: string, orgId: string | undefined, opts: SearchOpts = {}) {
  return useQuery({
    queryKey: ['wiki-search', query, orgId, opts],
    queryFn: () =>
      fetchApi<WikiSearchResponse>('/v1/wiki/search', {
        method: 'POST',
        headers: orgHeader(orgId),
        body: JSON.stringify({ query, ...opts }),
      }),
    enabled: !!orgId && query.length >= 2,
    staleTime: 10 * 1000,
  });
}

export function useWikiPage(slug: string, orgId: string | undefined) {
  return useQuery({
    queryKey: ['wiki-page', slug, orgId],
    queryFn: () =>
      fetchApi<WikiPage>(`/v1/wiki/pages/${encodeURIComponent(slug)}`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId && !!slug,
    staleTime: 30 * 1000,
  });
}

// === Sources ===

export interface WikiSource {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  project: string | null;
  tags: string[] | null;
  createdAt: string;
}

export interface WikiSourceDetail extends WikiSource {
  content: string;
}

interface WikiSourcesResponse {
  results: WikiSource[];
  hasMore: boolean;
}

export function useWikiSource(sourceId: string | null, orgId: string | undefined) {
  return useQuery({
    queryKey: ['wiki-source', sourceId, orgId],
    queryFn: () =>
      fetchApi<WikiSourceDetail>(`/v1/wiki/sources/${encodeURIComponent(sourceId!)}`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId && !!sourceId,
    staleTime: 60 * 1000,
  });
}

export function useWikiSources(
  orgId: string | undefined,
  opts: { limit?: number; offset?: number; project?: string } = {}
) {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  if (opts.project) params.set('project', opts.project);
  const qs = params.toString();

  return useQuery({
    queryKey: ['wiki-sources', orgId, opts],
    queryFn: () =>
      fetchApi<WikiSourcesResponse>(`/v1/wiki/sources${qs ? `?${qs}` : ''}`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId,
    staleTime: 30 * 1000,
  });
}

// === Activity Log ===

export interface WikiLogEntry {
  id: string;
  operation: string;
  agentId: string | null;
  summary: string;
  relatedPageIds: string[] | null;
  relatedSourceIds: string[] | null;
  createdAt: string;
}

interface WikiLogResponse {
  results: WikiLogEntry[];
  hasMore: boolean;
}

export function useWikiLog(
  orgId: string | undefined,
  opts: { limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();

  return useQuery({
    queryKey: ['wiki-log', orgId, opts],
    queryFn: () =>
      fetchApi<WikiLogResponse>(`/v1/wiki/log${qs ? `?${qs}` : ''}`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId,
    staleTime: 15 * 1000,
  });
}

// === Edit History ===

export interface WikiHistoryEntry {
  id: string;
  wikiPageId: string;
  pageSlug: string;
  pageTitle: string;
  version: number;
  editedByAgentId: string | null;
  editSummary: string | null;
  createdAt: string;
}

interface WikiHistoryResponse {
  results: WikiHistoryEntry[];
  hasMore: boolean;
}

export function useWikiHistory(
  orgId: string | undefined,
  opts: { limit?: number; offset?: number } = {}
) {
  const params = new URLSearchParams();
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();

  return useQuery({
    queryKey: ['wiki-history', orgId, opts],
    queryFn: () =>
      fetchApi<WikiHistoryResponse>(`/v1/wiki/history${qs ? `?${qs}` : ''}`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId,
    staleTime: 15 * 1000,
  });
}

// === Graph ===

export interface WikiGraphNode {
  id: string;
  slug: string;
  title: string;
  project: string | null;
  voteCount: number;
}

export interface WikiGraphEdge {
  sourceId: string;
  targetId: string;
  relationship: string;
}

interface WikiGraphResponse {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
}

export function useWikiGraph(orgId: string | undefined) {
  return useQuery({
    queryKey: ['wiki-graph', orgId],
    queryFn: () =>
      fetchApi<WikiGraphResponse>('/v1/wiki/graph', {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId,
    staleTime: 60 * 1000,
  });
}

// === Version History ===

export interface WikiVersionEntry {
  version: number;
  title: string;
  summary: string | null;
  body: string;
  tags: string[] | null;
  editSummary: string | null;
  createdAt: string;
}

interface WikiVersionsResponse {
  current: {
    version: number;
    title: string;
    summary: string | null;
    body: string;
    tags: string[] | null;
    updatedAt: string;
  };
  history: WikiVersionEntry[];
}

export function useWikiPageVersions(slug: string, orgId: string | undefined) {
  return useQuery({
    queryKey: ['wiki-page-versions', slug, orgId],
    queryFn: () =>
      fetchApi<WikiVersionsResponse>(`/v1/wiki/pages/${encodeURIComponent(slug)}/versions`, {
        headers: orgHeader(orgId),
      }),
    enabled: !!orgId && !!slug,
    staleTime: 30 * 1000,
  });
}

// === Vote ===

export function useVoteWikiPage(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, direction }: { slug: string; direction: 'up' | 'down' }) =>
      fetchApi<{ voteCount: number }>(`/v1/wiki/pages/${encodeURIComponent(slug)}/vote`, {
        method: 'POST',
        headers: orgHeader(orgId),
        body: JSON.stringify({ direction }),
      }),
    onSuccess: (_data, { slug }) => {
      queryClient.invalidateQueries({ queryKey: ['wiki-page', slug, orgId] });
      queryClient.invalidateQueries({ queryKey: ['wiki-pages', orgId] });
    },
  });
}

// === Create (slug generated by backend) ===

export interface CreateWikiPageInput {
  title: string;
  summary: string;
  body: string;
  project?: string;
  tags?: string[];
}

interface CreateWikiPageResponse {
  id: string;
  slug: string;
  version: number;
  status: 'created';
}

export function useCreateWikiPage(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWikiPageInput) =>
      fetchApi<CreateWikiPageResponse>('/v1/wiki/pages', {
        method: 'POST',
        headers: orgHeader(orgId),
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wiki-pages', orgId] });
      queryClient.invalidateQueries({ queryKey: ['wiki-graph', orgId] });
    },
  });
}

// === Upsert (update existing page by slug) ===

export interface UpsertWikiPageInput {
  slug: string;
  title: string;
  summary: string;
  body: string;
  version?: number;
  editSummary?: string;
  project?: string;
  tags?: string[];
}

interface UpsertWikiPageResponse {
  id: string;
  version: number;
  status: 'created' | 'updated';
}

export function useUpsertWikiPage(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertWikiPageInput) =>
      fetchApi<UpsertWikiPageResponse>(`/v1/wiki/pages/${encodeURIComponent(input.slug)}`, {
        method: 'PUT',
        headers: orgHeader(orgId),
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: ['wiki-pages', orgId] });
      queryClient.invalidateQueries({ queryKey: ['wiki-page', input.slug, orgId] });
      queryClient.invalidateQueries({ queryKey: ['wiki-graph', orgId] });
    },
  });
}
