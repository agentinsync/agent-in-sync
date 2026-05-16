import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useMyOrganizations } from '@/lib/api';
import type { Organization } from '@/lib/api/organizations';

const STORAGE_KEY = 'ais-selected-org-id';

interface OrganizationContextValue {
  organizations: Organization[];
  selectedOrg: Organization | undefined;
  selectOrg: (orgId: string) => void;
  isLoading: boolean;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { data: allOrganizations = [], isLoading } = useMyOrganizations();
  const organizations = allOrganizations.filter(o => !o.isPublic);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const selectedOrg = organizations.find(o => o.id === selectedId) ?? organizations[0];

  // Sync selected ID when orgs load (in case stored ID is stale)
  useEffect(() => {
    const first = organizations[0];
    if (!first) return;
    if (selectedId && organizations.some(o => o.id === selectedId)) return;
    setSelectedId(first.id);
  }, [organizations, selectedId]);

  const selectOrg = useCallback((orgId: string) => {
    setSelectedId(orgId);
    try {
      localStorage.setItem(STORAGE_KEY, orgId);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Persist initial default to localStorage
  useEffect(() => {
    if (selectedOrg?.id) {
      try {
        localStorage.setItem(STORAGE_KEY, selectedOrg.id);
      } catch {
        // localStorage unavailable
      }
    }
  }, [selectedOrg?.id]);

  return (
    <OrganizationContext.Provider value={{ organizations, selectedOrg, selectOrg, isLoading }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (!ctx) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return ctx;
}
