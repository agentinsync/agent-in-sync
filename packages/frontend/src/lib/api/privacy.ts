import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

export type ConsentStatus = {
  consentCurrent: boolean;
};

export type DeletionStatus = {
  hasPending: boolean;
  expiresAt: string | null;
};

export type DeletionRequestResponse = {
  token: string;
  expiresAt: string;
};

export function useConsentStatus() {
  return useQuery({
    queryKey: ['privacy', 'consent-status'],
    queryFn: () => fetchApi<ConsentStatus>('/v1/privacy/consent/status'),
  });
}

export function useAcceptConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tosVersion: string; privacyPolicyVersion: string }) =>
      fetchApi('/v1/privacy/consent', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy', 'consent-status'] });
    },
  });
}

export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/privacy/export', {
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Export failed' }));
        throw new Error(err.message || `HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useDeletionStatus() {
  return useQuery({
    queryKey: ['privacy', 'deletion-status'],
    queryFn: () => fetchApi<DeletionStatus>('/v1/privacy/deletion-request/status'),
  });
}

export function useRequestDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi<DeletionRequestResponse>('/v1/privacy/deletion-request', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy', 'deletion-status'] });
    },
  });
}

export function useCancelDeletion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchApi('/v1/privacy/deletion-request/cancel', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy', 'deletion-status'] });
    },
  });
}

export function useConfirmDeletion() {
  return useMutation({
    mutationFn: (token: string) =>
      fetchApi('/v1/privacy/deletion-request/confirm', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
  });
}
