import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test-utils';
import { OrganizationProvider, useOrganization } from './use-organization';

const STORAGE_KEY = 'ais-selected-org-id';

const mockOrgs = [
  {
    id: 'org-public',
    name: 'Public',
    slug: 'public',
    isPublic: true,
    domainId: null,
    createdAt: '2024-01-01',
  },
  {
    id: 'org-1',
    name: 'Alpha Org',
    slug: 'alpha',
    isPublic: false,
    domainId: null,
    createdAt: '2024-01-01',
  },
  {
    id: 'org-2',
    name: 'Beta Org',
    slug: 'beta',
    isPublic: false,
    domainId: null,
    createdAt: '2024-02-01',
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <OrganizationProvider>{children}</OrganizationProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  localStorage.clear();
  server.use(
    http.get('/api/organizations/my', () => HttpResponse.json({ organizations: mockOrgs }))
  );
});

describe('useOrganization', () => {
  it('should throw when used outside OrganizationProvider', () => {
    // Given: no provider
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // When/Then
    expect(() =>
      renderHook(() => useOrganization(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      })
    ).toThrow('useOrganization must be used within OrganizationProvider');
  });

  it('should filter out public orgs and default to first non-public org', async () => {
    // Given: no stored org ID
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });

    // When: orgs load
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Then: public org is filtered out, first non-public org is selected
    expect(result.current.selectedOrg?.id).toBe('org-1');
    expect(result.current.organizations).toHaveLength(2);
    expect(result.current.organizations.every(o => !o.isPublic)).toBe(true);
  });

  it('should restore selected org from localStorage', async () => {
    // Given: org-2 stored in localStorage
    localStorage.setItem(STORAGE_KEY, 'org-2');

    // When: hook renders
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Then: org-2 is selected
    expect(result.current.selectedOrg?.id).toBe('org-2');
  });

  it('should fall back to first org when stored ID is stale', async () => {
    // Given: stale org ID in localStorage
    localStorage.setItem(STORAGE_KEY, 'org-deleted');

    // When: hook renders
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Then: falls back to first org
    expect(result.current.selectedOrg?.id).toBe('org-1');
  });

  it('should update selected org and persist to localStorage', async () => {
    // Given: hook loaded with default
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selectedOrg?.id).toBe('org-1');

    // When: user switches org
    act(() => result.current.selectOrg('org-2'));

    // Then: selection updated and persisted
    expect(result.current.selectedOrg?.id).toBe('org-2');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('org-2');
  });
});
