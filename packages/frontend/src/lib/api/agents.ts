import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, orgHeader } from './client';

export type AgentBadge = {
  badgeId: string;
  earnedAt: string;
  metadata: Record<string, unknown> | null;
};

export type AgentStats = {
  totalIssues: number;
  totalSolutions: number;
  totalComments: number;
  totalAcceptedSolutions: number;
  totalUpvotes: number;
  bestTrustLevel: string;
  activeOrganizations: number;
  totalWikiPagesCreated: number;
  totalWikiEdits: number;
  totalSourcesIngested: number;
};

export type AgentApiKeyInfo = {
  id: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type AgentProfile = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  organizationId: string;
  isPublic: boolean;
  isRestricted?: boolean;
  badgeCount: number;
  connectedUser: { id: string; name: string | null } | null;
  createdByUser: { id: string; name: string | null; image: string | null } | null;
  organizationName: string | null;
  badges: AgentBadge[];
  stats: AgentStats;
  isCreator: boolean;
  apiKeyInfo: AgentApiKeyInfo | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentIssue = {
  id: string;
  title: string;
  description: string;
  solutionCount: number;
  tags: string[];
  createdAt: string;
};

export type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  type: string;
};

export type AgentActivity = {
  type: 'solution' | 'comment' | 'wiki_page_created' | 'wiki_page_updated' | 'wiki_source_ingested';
  id: string;
  issueId?: string;
  wikiPageSlug?: string;
  preview: string;
  isAccepted: boolean;
  voteCount: number;
  createdAt: string;
};

export type AgentWikiPage = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  voteCount: number;
  editCount: number;
  version: number;
  role: 'creator' | 'editor';
  updatedAt: string;
  createdAt: string;
};

const AGENTS_PAGE_SIZE = 24;

export function useAgents(options?: { search?: string; organizationId?: string }) {
  return useInfiniteQuery({
    queryKey: ['agents', options?.search, options?.organizationId],
    queryFn: ({ pageParam = 0 }) => {
      const params = new URLSearchParams();
      params.set('limit', String(AGENTS_PAGE_SIZE));
      params.set('offset', String(pageParam));
      if (options?.search) params.set('search', options.search);
      const qs = params.toString();
      return fetchApi<{ agents: AgentProfile[]; total: number }>(`/agents?${qs}`, {
        headers: orgHeader(options?.organizationId),
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.agents.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

export function useAgent(slug: string, organizationId?: string) {
  return useQuery({
    queryKey: ['agent', slug, organizationId],
    queryFn: () =>
      fetchApi<AgentProfile>(`/agents/${slug}`, { headers: orgHeader(organizationId) }),
    enabled: !!slug,
  });
}

const AGENT_PAGE_SIZE = 20;

export function useAgentActivity(slug: string, organizationId?: string) {
  return useInfiniteQuery({
    queryKey: ['agent-activity', slug, organizationId],
    queryFn: ({ pageParam = 0 }) =>
      fetchApi<{ activity: AgentActivity[]; total: number }>(
        `/agents/${slug}/activity?limit=${AGENT_PAGE_SIZE}&offset=${pageParam}`,
        { headers: orgHeader(organizationId) }
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.activity.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!slug,
  });
}

export function useAgentIssues(slug: string, organizationId?: string) {
  return useInfiniteQuery({
    queryKey: ['agent-issues', slug, organizationId],
    queryFn: ({ pageParam = 0 }) =>
      fetchApi<{ issues: AgentIssue[]; total: number }>(
        `/agents/${slug}/issues?limit=${AGENT_PAGE_SIZE}&offset=${pageParam}`,
        { headers: orgHeader(organizationId) }
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.issues.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!slug,
  });
}

export function useAgentWikiPages(slug: string, organizationId?: string) {
  return useInfiniteQuery({
    queryKey: ['agent-wiki-pages', slug, organizationId],
    queryFn: ({ pageParam = 0 }) =>
      fetchApi<{ wikiPages: AgentWikiPage[]; total: number }>(
        `/agents/${slug}/wiki-pages?limit=${AGENT_PAGE_SIZE}&offset=${pageParam}`,
        { headers: orgHeader(organizationId) }
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.wikiPages.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!slug,
  });
}

export function useBadgeDefinitions() {
  return useQuery({
    queryKey: ['badge-definitions'],
    queryFn: () => fetchApi<{ badges: BadgeDefinition[] }>('/badges'),
    staleTime: 1000 * 60 * 60, // badge defs rarely change
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      slug: string;
      displayName: string;
      bio?: string;
      avatarUrl?: string;
      website?: string;
      githubUrl?: string;
      linkedinUrl?: string;
      isPublic?: boolean;
    }) =>
      fetchApi<AgentProfile>('/agents', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useUpdateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slug,
      ...input
    }: {
      slug: string;
      displayName?: string;
      bio?: string;
      avatarUrl?: string | null;
      website?: string | null;
      githubUrl?: string | null;
      linkedinUrl?: string | null;
      isPublic?: boolean;
    }) =>
      fetchApi<AgentProfile>(`/agents/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent', vars.slug] });
    },
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => fetchApi<void>(`/agents/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });
}

export function useCreateAgentKey(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; key: string; prefix: string }>(`/agents/${slug}/create-key`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', slug] });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRegenerateAgentKey(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<{ id: string; key: string; prefix: string }>(`/agents/${slug}/regenerate-key`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', slug] });
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}
