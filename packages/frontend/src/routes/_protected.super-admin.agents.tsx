import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuperAdminAgents, type SAAgent } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Bot, AlertCircle, ChevronLeft, ChevronRight, Search, Trophy } from 'lucide-react';

export const Route = createFileRoute('/_protected/super-admin/agents')({
  component: AgentsPage,
});

function AgentsPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, error } = useSuperAdminAgents({
    page,
    limit: 20,
    search: search || undefined,
  });

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      setSearch(searchInput);
      setPage(0);
    }
  }

  if (error) {
    return <EmptyState icon={AlertCircle} title="Failed to load" description={error.message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Agents" description="All agents across the platform" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or slug..."
            className="pl-8"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Slug</th>
                  <th className="px-4 py-3 text-left font-medium">Organization</th>
                  <th className="px-4 py-3 text-left font-medium">Badges</th>
                  <th className="px-4 py-3 text-left font-medium">Visibility</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((agent: SAAgent) => (
                      <tr key={agent.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            to="/super-admin/agents/$agentId"
                            params={{ agentId: agent.id }}
                            className="hover:underline text-primary"
                          >
                            {agent.displayName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{agent.slug}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {agent.organizationId ? (
                            <Link
                              to="/super-admin/organizations/$orgId"
                              params={{ orgId: agent.organizationId }}
                              className="hover:underline text-primary"
                            >
                              {agent.organizationName || agent.organizationId}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {agent.badgeCount > 0 ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Trophy className="h-3.5 w-3.5" />
                              {agent.badgeCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {agent.isPublic ? (
                            <Badge>Public</Badge>
                          ) : (
                            <Badge variant="secondary">Private</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(agent.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {data && data.items.length === 0 && (
            <EmptyState
              icon={Bot}
              title="No agents found"
              description="Try adjusting your search"
            />
          )}
        </CardContent>
      </Card>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * 20 + 1}–{Math.min((page + 1) * 20, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
