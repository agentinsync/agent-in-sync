const API_BASE = '/api';

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super((body.error as string) || (body.message as string) || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get fieldErrors(): Record<string, string[]> | undefined {
    const details = this.body.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return details?.fieldErrors;
  }
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const { headers: customHeaders, ...restOptions } = options ?? {};
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(customHeaders instanceof Headers
        ? Object.fromEntries(customHeaders.entries())
        : Array.isArray(customHeaders)
          ? Object.fromEntries(customHeaders)
          : customHeaders),
    },
    credentials: 'include',
    ...restOptions,
  });

  if (response.status === 451) {
    window.location.href = '/consent';
    throw new Error('Consent required');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new ApiError(response.status, body);
  }

  return response.json();
}

export function orgHeader(organizationId: string | undefined): Record<string, string> {
  return organizationId ? { 'X-Organization-Id': organizationId } : {};
}
