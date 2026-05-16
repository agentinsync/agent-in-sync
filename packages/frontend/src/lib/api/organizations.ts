import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  domainId: string | null;
  createdAt: string;
  role?: string;
  memberCount?: number;
}

export interface AvailableOrganization {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
}

export interface DomainInfo {
  hasDomain: boolean;
  domain: {
    id: string;
    name: string;
    status: string;
    isAdmin: boolean;
    memberCount: number;
    organizationCount: number;
    canCreateOrganization: boolean;
    maxOrganizations: number;
  } | null;
}

interface CreateOrganizationParams {
  name: string;
  slug: string;
}

export interface OrgDetail extends Omit<Organization, 'role'> {
  role: string | null;
}

export function useOrgBySlug(slug: string) {
  return useQuery({
    queryKey: ['organizations', 'slug', slug],
    queryFn: () => fetchApi<OrgDetail>(`/organizations/slug/${slug}`),
    enabled: !!slug,
  });
}

export function useMyOrganizations() {
  return useQuery({
    queryKey: ['organizations', 'my'],
    queryFn: () =>
      fetchApi<{ organizations: Organization[] }>('/organizations/my').then(r => r.organizations),
  });
}

export function useAvailableOrganizations() {
  return useQuery({
    queryKey: ['organizations', 'available'],
    queryFn: () =>
      fetchApi<{ organizations: AvailableOrganization[] }>('/organizations/available').then(
        r => r.organizations
      ),
  });
}

export function useDomainInfo() {
  return useQuery({
    queryKey: ['organizations', 'domain-info'],
    queryFn: () => fetchApi<DomainInfo>('/organizations/domain-info'),
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateOrganizationParams) =>
      fetchApi<Organization>('/organizations', {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export function useJoinOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) =>
      fetchApi(`/organizations/${orgId}/join`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export type AgentSummary = {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  isPublic: boolean;
  apiKeyId: string | null;
};

export type OrgMember = {
  id: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  userEmail: string;
  role: 'member' | 'admin' | 'reviewer';
  createdAt: string;
  agents: AgentSummary[];
};

export interface OrgMembersResponse {
  members: OrgMember[];
  total: number;
  callerRole: 'member' | 'admin' | 'reviewer';
}

const MEMBERS_PAGE_SIZE = 20;

export function useOrgMembers(orgId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['org-members', orgId],
    queryFn: ({ pageParam = 0 }) =>
      fetchApi<OrgMembersResponse>(
        `/organizations/${orgId}/members?limit=${MEMBERS_PAGE_SIZE}&offset=${pageParam}`
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.members.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!orgId,
  });
}

export function useRemoveOrgMember(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetUserId: string) =>
      fetchApi(`/organizations/${orgId}/members/${targetUserId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

export interface OrganizationSettings {
  searchScope: 'org_only' | 'domain_orgs' | 'org_and_public';
  defaultSearchLimit: number;
  contentSharingEnabled: boolean;
  autoApproveMinTrustLevel: string;
  duplicateDetectionThreshold: number;
  badgeVisibility: boolean;
}

export function useOrgSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-settings', orgId],
    queryFn: () => fetchApi<OrganizationSettings>(`/admin/organizations/${orgId}/settings`),
    enabled: !!orgId,
  });
}

export function useUpdateOrgSettings(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<OrganizationSettings>) =>
      fetchApi<OrganizationSettings>(`/admin/organizations/${orgId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    onSuccess: data => {
      queryClient.setQueryData(['org-settings', orgId], data);
    },
  });
}

export function useRevokeAgentApiKey(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      fetchApi(`/organizations/${orgId}/agents/${agentId}/revoke-key`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-members', orgId] });
    },
  });
}
