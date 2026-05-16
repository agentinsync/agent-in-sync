import { useMutation } from '@tanstack/react-query';

export interface SsoCheckResponse {
  ssoEnabled: boolean;
  authMethod: 'sso' | 'oauth';
  loginUrl?: string;
  domainName?: string;
  message: string;
}

export function useCheckEmailSso() {
  return useMutation({
    mutationFn: async (email: string): Promise<SsoCheckResponse> => {
      const response = await fetch('/saml/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(err.message || `HTTP ${response.status}`);
      }
      return response.json();
    },
  });
}
