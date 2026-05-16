import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';

export interface DomainResponse {
  id: string;
  name: string;
  status: 'pending' | 'verified';
  verificationMethod: string | null;
  verifiedAt: string | null;
  ssoEnabled: boolean;
  memberCount: number;
  organizationCount: number;
  createdAt: string;
}

export interface DomainVerificationResponse {
  domainId: string;
  domainName: string;
  status: 'pending' | 'verified';
  verificationToken: string | null;
  dnsRecordType?: 'TXT';
  dnsRecordName?: string;
  dnsRecordValue?: string;
}

export interface SsoConfig {
  enabled: boolean;
  config: {
    idpEntityId: string;
    idpSsoUrl: string;
    spEntityId: string;
    spAcsUrl: string;
    spMetadataUrl: string;
    attributeMapping: {
      email: string;
      firstName?: string;
      lastName?: string;
      groups?: string;
    };
    signRequests: boolean;
    wantAssertionsSigned: boolean;
  } | null;
}

export interface SsoConfigInput {
  idpEntityId: string;
  idpSsoUrl: string;
  idpCertificate: string;
  attributeMapping?: {
    email: string;
    firstName?: string;
    lastName?: string;
    groups?: string;
  };
  signRequests?: boolean;
  wantAssertionsSigned?: boolean;
}

export function useDomain(domainName: string) {
  return useQuery({
    queryKey: ['domain', domainName],
    queryFn: () => fetchApi<DomainResponse>(`/domains/${domainName}`),
    enabled: !!domainName,
  });
}

export function useRequestDnsVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainName: string) =>
      fetchApi<DomainVerificationResponse>(`/domains/${domainName}/verify`, {
        method: 'POST',
      }),
    onSuccess: (_, domainName) => {
      queryClient.invalidateQueries({ queryKey: ['domain', domainName] });
    },
  });
}

export function useCheckDnsVerification(domainName: string) {
  return useQuery({
    queryKey: ['domain', domainName, 'verification'],
    queryFn: () =>
      fetchApi<DomainVerificationResponse & { dnsVerified: boolean }>(
        `/domains/${domainName}/verify`
      ),
    enabled: !!domainName,
    refetchInterval: false,
  });
}

export function useSsoConfig(domainName: string) {
  return useQuery({
    queryKey: ['domain', domainName, 'sso'],
    queryFn: () => fetchApi<SsoConfig>(`/domains/${domainName}/sso`),
    enabled: !!domainName,
  });
}

export function useUpdateSsoConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ domainName, config }: { domainName: string; config: SsoConfigInput }) =>
      fetchApi(`/domains/${domainName}/sso`, {
        method: 'PUT',
        body: JSON.stringify(config),
      }),
    onSuccess: (_, { domainName }) => {
      queryClient.invalidateQueries({ queryKey: ['domain', domainName, 'sso'] });
    },
  });
}

export function useDeleteSsoConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (domainName: string) =>
      fetchApi(`/domains/${domainName}/sso`, {
        method: 'DELETE',
      }),
    onSuccess: (_, domainName) => {
      queryClient.invalidateQueries({ queryKey: ['domain', domainName, 'sso'] });
    },
  });
}
