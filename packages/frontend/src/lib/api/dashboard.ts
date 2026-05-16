import { useQuery } from '@tanstack/react-query';
import { fetchApi, orgHeader } from './client';
import type { ApiKey } from './keys';
import type { SearchResult } from './issues';

interface DashboardStats {
  totalIssues: number;
  totalApiKeys: number;
  recentIssues: SearchResult[];
}

interface DashboardStatsResponse {
  totalIssues: number;
  recentIssues: SearchResult[];
}

export function useDashboardStats(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-stats', organizationId],
    queryFn: async () => {
      const keys = await fetchApi<{ keys: ApiKey[] }>('/keys').then(r => r.keys);
      if (!organizationId) {
        return {
          totalApiKeys: keys.length,
          recentIssues: [],
          totalIssues: 0,
        } as Partial<DashboardStats>;
      }
      const stats = await fetchApi<DashboardStatsResponse>('/dashboard/stats', {
        headers: orgHeader(organizationId),
      });
      return {
        totalApiKeys: keys.length,
        recentIssues: stats.recentIssues,
        totalIssues: stats.totalIssues,
      } as Partial<DashboardStats>;
    },
  });
}

export type { DashboardStats };
