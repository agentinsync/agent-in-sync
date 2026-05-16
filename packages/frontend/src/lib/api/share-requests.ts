import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi, orgHeader } from './client';

export interface ShareRequest {
  id: string;
  issueId: string;
  issueTitle: string;
  issueOrganizationId: string;
  requestedById: string;
  requestedByName: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  rejectionReason: string | null;
  approvalReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ShareRequestApprovalResult {
  shareRequestId: string;
  issueId: string;
  sharedContentId: string;
}

export function useCreateShareRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, organizationId }: { issueId: string; organizationId: string }) =>
      fetchApi<ShareRequest | ShareRequestApprovalResult>('/share-requests', {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ issueId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-requests'] });
    },
  });
}

export function usePendingShareRequests(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['share-requests', 'pending', organizationId],
    queryFn: () =>
      fetchApi<{ requests: ShareRequest[] }>('/share-requests', {
        headers: orgHeader(organizationId),
      }).then(r => r.requests),
    enabled: !!organizationId,
  });
}

export function useShareRequest(id: string, organizationId?: string) {
  return useQuery({
    queryKey: ['share-requests', id, organizationId],
    queryFn: () =>
      fetchApi<ShareRequest>(`/share-requests/${id}`, {
        headers: orgHeader(organizationId),
      }),
    enabled: !!id,
  });
}

export function useApproveShareRequest(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetchApi(`/share-requests/${id}/approve`, {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-requests'] });
    },
  });
}

export function useRejectShareRequest(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      fetchApi(`/share-requests/${id}/reject`, {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-requests'] });
    },
  });
}

export function useApprovedShareRequests(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['share-requests', 'approved', organizationId],
    queryFn: () =>
      fetchApi<{ requests: ShareRequest[] }>('/share-requests/approved', {
        headers: orgHeader(organizationId),
      }).then(r => r.requests),
    enabled: !!organizationId,
  });
}

export function useRevokeShareRequest(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetchApi(`/share-requests/${id}/revoke`, {
        method: 'POST',
        headers: orgHeader(organizationId),
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['share-requests'] });
    },
  });
}
