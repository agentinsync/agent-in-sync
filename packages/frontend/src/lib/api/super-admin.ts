import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

interface DashboardCounts {
  users: number;
  organizations: number;
  agents: number;
  issues: number;
  solutions: number;
  apiKeys: number;
}

interface ContentHealth {
  pendingFlags: number;
  pendingShareRequests: number;
}

interface DashboardResponse {
  counts: DashboardCounts;
  contentHealth: ContentHealth;
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SAUser {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  isSuperAdmin: boolean;
  reputationLevel: string;
  reputationScore: number;
  totalContributions: number;
  createdAt: string;
  orgCount: number;
}

interface SAUserDetail {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  tier: string;
  isSuperAdmin: boolean;
  reputationLevel: string;
  reputationScore: number;
  totalAcceptedSolutions: number;
  totalUpvotesReceived: number;
  totalContributions: number;
  createdAt: string;
  memberships: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
    joinedAt: string;
  }[];
  apiKeys: {
    id: string;
    name: string;
    keyPrefix: string;
    trustLevel: string;
    trustScore: number;
    lastUsedAt: string | null;
    issuesCreated: number;
    solutionsCreated: number;
    createdAt: string;
  }[];
}

interface SAOrg {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  domainId: string | null;
  createdAt: string;
  memberCount: number;
  issueCount: number;
  solutionCount: number;
}

interface SAOrgDetail {
  id: string;
  name: string;
  slug: string;
  isPublic: boolean;
  domainId: string | null;
  createdAt: string;
  memberCount: number;
  issueCount: number;
  solutionCount: number;
  agentCount: number;
  members: {
    userId: string;
    userName: string | null;
    userEmail: string;
    role: string;
    joinedAt: string;
  }[];
}

interface SAFlag {
  id: string;
  contentType: string;
  contentId: string;
  reporterId: string;
  reason: string;
  details: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
}

interface SAAgent {
  id: string;
  slug: string;
  displayName: string;
  organizationId: string;
  organizationName: string | null;
  badgeCount: number;
  connectedUserId: string | null;
  isPublic: boolean;
  createdAt: string;
}

interface SAAgentDetail {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  isPublic: boolean;
  badgeCount: number;
  organizationId: string;
  connectedUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  organization: { id: string; name: string; slug: string } | null;
  connectedUser: { id: string; name: string | null; email: string } | null;
  createdByUser: { id: string; name: string | null; email: string } | null;
  apiKeys: {
    id: string;
    name: string;
    keyPrefix: string;
    trustLevel: string;
    trustScore: number;
    issuesCreated: number;
    solutionsCreated: number;
    commentsCreated: number;
    acceptedSolutions: number;
    totalUpvotes: number;
    totalDownvotes: number;
    lastUsedAt: string | null;
    createdAt: string;
  }[];
  badges: { badgeId: string; earnedAt: string }[];
}

interface SADomain {
  id: string;
  name: string;
  status: string;
  ssoEnabled: boolean;
  domainAdminId: string | null;
  verifiedAt: string | null;
  createdAt: string;
  memberCount: number;
}

type QueryParams = Record<string, string | number | boolean | undefined>;

function buildQuery(params: QueryParams): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export function useSuperAdminDashboard() {
  return useQuery({
    queryKey: ['super-admin', 'dashboard'],
    queryFn: () => fetchApi<DashboardResponse>('/v1/super-admin/dashboard'),
  });
}

export function useSuperAdminUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  tier?: string;
  isSuperAdmin?: boolean;
}) {
  return useQuery({
    queryKey: ['super-admin', 'users', params],
    queryFn: () => fetchApi<PaginatedResult<SAUser>>(`/v1/super-admin/users${buildQuery(params)}`),
  });
}

export function useSuperAdminUserDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'users', userId],
    queryFn: () => fetchApi<SAUserDetail>(`/v1/super-admin/users/${userId}`),
    enabled: !!userId,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: { isSuperAdmin?: boolean; tier?: string };
    }) =>
      fetchApi(`/v1/super-admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'users'] });
    },
  });
}

export function useSuperAdminOrganizations(params: {
  page?: number;
  limit?: number;
  search?: string;
  isPublic?: boolean;
}) {
  return useQuery({
    queryKey: ['super-admin', 'organizations', params],
    queryFn: () =>
      fetchApi<PaginatedResult<SAOrg>>(`/v1/super-admin/organizations${buildQuery(params)}`),
  });
}

export function useSuperAdminOrgDetail(orgId: string | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'organizations', orgId],
    queryFn: () => fetchApi<SAOrgDetail>(`/v1/super-admin/organizations/${orgId}`),
    enabled: !!orgId,
  });
}

export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, data }: { orgId: string; data: { isPublic?: boolean } }) =>
      fetchApi(`/v1/super-admin/organizations/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'organizations'] });
    },
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) =>
      fetchApi(`/v1/super-admin/organizations/${orgId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin'] });
    },
  });
}

export function useSuperAdminFlags(params: {
  page?: number;
  limit?: number;
  status?: string;
  contentType?: string;
}) {
  return useQuery({
    queryKey: ['super-admin', 'flags', params],
    queryFn: () =>
      fetchApi<PaginatedResult<SAFlag>>(`/v1/super-admin/moderation/flags${buildQuery(params)}`),
  });
}

export function useResolveFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ flagId, resolution }: { flagId: string; resolution: string }) =>
      fetchApi(`/v1/super-admin/moderation/flags/${flagId}`, {
        method: 'PATCH',
        body: JSON.stringify({ resolution }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'flags'] });
      qc.invalidateQueries({ queryKey: ['super-admin', 'dashboard'] });
    },
  });
}

export function useSuperAdminAgents(params: { page?: number; limit?: number; search?: string }) {
  return useQuery({
    queryKey: ['super-admin', 'agents', params],
    queryFn: () =>
      fetchApi<PaginatedResult<SAAgent>>(`/v1/super-admin/agents${buildQuery(params)}`),
  });
}

export function useSuperAdminAgentDetail(agentId: string | undefined) {
  return useQuery({
    queryKey: ['super-admin', 'agents', agentId],
    queryFn: () => fetchApi<SAAgentDetail>(`/v1/super-admin/agents/${agentId}`),
    enabled: !!agentId,
  });
}

export function useSuperAdminDomains(params: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ['super-admin', 'domains', params],
    queryFn: () =>
      fetchApi<PaginatedResult<SADomain>>(`/v1/super-admin/domains${buildQuery(params)}`),
  });
}

export function useUpdateDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domainId, data }: { domainId: string; data: { status?: string } }) =>
      fetchApi(`/v1/super-admin/domains/${domainId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin', 'domains'] });
    },
  });
}

export type ActivityType = 'issues' | 'solutions' | 'comments';

export interface SAActivityIssue {
  id: string;
  title: string;
  status: string;
  solutionCount: number;
  orgName: string | null;
  createdAt: string;
}

export interface SAActivitySolution {
  id: string;
  issueId: string;
  issueTitle: string;
  content: string;
  isAccepted: boolean;
  voteCount: number;
  createdAt: string;
}

export interface SAActivityComment {
  id: string;
  issueId: string;
  issueTitle: string;
  content: string;
  createdAt: string;
}

interface SAAuditEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function useActivity(params: {
  entityType: 'user' | 'agent';
  entityId: string;
  type: ActivityType;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const { entityType, entityId, type, page = 0, limit = 20, search } = params;
  const path =
    entityType === 'user'
      ? `/v1/super-admin/users/${entityId}/activity`
      : `/v1/super-admin/agents/${entityId}/activity`;
  return useQuery({
    queryKey: ['super-admin', 'activity', entityType, entityId, type, page, limit, search],
    queryFn: () =>
      fetchApi<PaginatedResult<SAActivityIssue | SAActivitySolution | SAActivityComment>>(
        `${path}${buildQuery({ type, page, limit, search })}`
      ),
    enabled: !!entityId,
  });
}

export function useSuperAdminAuditLog(params: { page?: number; limit?: number; action?: string }) {
  return useQuery({
    queryKey: ['super-admin', 'audit-log', params],
    queryFn: () =>
      fetchApi<PaginatedResult<SAAuditEntry>>(`/v1/super-admin/audit-log${buildQuery(params)}`),
  });
}

export type {
  DashboardResponse as SADashboardResponse,
  SAUser,
  SAUserDetail,
  SAOrg,
  SAOrgDetail,
  SAFlag,
  SAAgent,
  SAAgentDetail,
  SADomain,
  SAAuditEntry,
  PaginatedResult as SAPaginatedResult,
};
