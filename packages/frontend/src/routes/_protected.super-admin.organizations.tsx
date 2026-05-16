import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuperAdminOrganizations, useDeleteOrganization, type SAOrg } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, AlertCircle, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/super-admin/organizations')({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, error } = useSuperAdminOrganizations({
    page,
    limit: 20,
    search: search || undefined,
  });

  const deleteOrg = useDeleteOrganization();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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
      <PageHeader title="Organizations" description="Manage all platform organizations" />

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
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Members</th>
                  <th className="px-4 py-3 text-left font-medium">Issues</th>
                  <th className="px-4 py-3 text-left font-medium">Solutions</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((org: SAOrg) => (
                      <tr key={org.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            to="/super-admin/organizations/$orgId"
                            params={{ orgId: org.id }}
                            className="hover:underline text-primary"
                          >
                            {org.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{org.slug}</td>
                        <td className="px-4 py-3">
                          {org.isPublic ? (
                            <Badge>Public</Badge>
                          ) : (
                            <Badge variant="secondary">Private</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">{org.memberCount}</td>
                        <td className="px-4 py-3">{org.issueCount}</td>
                        <td className="px-4 py-3">{org.solutionCount}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(org.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!org.isPublic && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ id: org.id, name: org.name })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {data && data.items.length === 0 && (
            <EmptyState
              icon={Building2}
              title="No organizations found"
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => !open && setDeleteTarget(null)}
        title="Delete Organization"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Content will be preserved in the deleted-content pool.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteOrg.mutate(deleteTarget.id, {
            onSuccess: () => {
              toast.success('Organization deleted');
              setDeleteTarget(null);
            },
            onError: (err: Error) => toast.error(err.message),
          });
        }}
        isPending={deleteOrg.isPending}
      />
    </div>
  );
}
