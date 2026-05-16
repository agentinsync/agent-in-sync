import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  organizationId: string;
  createdAt: string;
  lastUsedAt: string | null;
  agent: { id: string; slug: string; displayName: string } | null;
}

interface CreateApiKeyResponse {
  id: string;
  key: string;
  prefix: string;
  organizationId: string;
  agentId: string;
  agentSlug: string;
  message: string;
}

interface CreateApiKeyInput {
  name: string;
  organizationId: string;
}

export function useApiKeys(organizationId?: string) {
  const queryParams = organizationId ? `?organizationId=${organizationId}` : '';
  return useQuery({
    queryKey: ['api-keys', organizationId],
    queryFn: async () => {
      const response = await fetchApi<{ keys: ApiKey[] }>(`/keys${queryParams}`);
      return response.keys;
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, organizationId }: CreateApiKeyInput) =>
      fetchApi<CreateApiKeyResponse>('/keys', {
        method: 'POST',
        body: JSON.stringify({ name, organizationId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      fetchApi(`/keys/${keyId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRegenerateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      fetchApi<CreateApiKeyResponse>(`/keys/${keyId}/regenerate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

interface VerifyResponse {
  ok: boolean;
  agent: { name: string; slug: string } | null;
  organization: { name: string; slug: string } | null;
  lastUsedAt: string | null;
}

export function useVerifyConnection(apiKey: string | null) {
  return useQuery({
    queryKey: ['verify', apiKey],
    queryFn: async () => {
      const response = await fetch('/api/v1/verify', {
        headers: { 'X-API-Key': apiKey! },
      });
      if (!response.ok) throw new Error('Verification failed');
      return response.json() as Promise<VerifyResponse>;
    },
    enabled: !!apiKey,
    retry: false,
  });
}

export type { ApiKey, CreateApiKeyResponse, CreateApiKeyInput, VerifyResponse };
