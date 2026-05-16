import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuperAdminDomains, useUpdateDomain, type SADomain } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Globe, AlertCircle, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/super-admin/domains')({
  component: DomainsPage,
});

function DomainsPage() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error } = useSuperAdminDomains({
    page,
    limit: 20,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const updateDomain = useUpdateDomain();
  const [confirmAction, setConfirmAction] = useState<{
    domainId: string;
    newStatus: string;
    label: string;
  } | null>(null);

  if (error) {
    return <EmptyState icon={AlertCircle} title="Failed to load" description={error.message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Domains" description="Manage verified and pending domains" />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={statusFilter}
          onValueChange={v => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Domain</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">SSO</th>
                  <th className="px-4 py-3 text-left font-medium">Members</th>
                  <th className="px-4 py-3 text-left font-medium">Verified At</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((domain: SADomain) => (
                      <tr key={domain.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{domain.name}</td>
                        <td className="px-4 py-3">
                          {domain.status === 'verified' ? (
                            <Badge className="gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {domain.ssoEnabled ? (
                            <Badge variant="outline">Enabled</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">{domain.memberCount}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {domain.verifiedAt
                            ? new Date(domain.verifiedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(domain.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {domain.status === 'pending' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  domainId: domain.id,
                                  newStatus: 'verified',
                                  label: `Force-verify "${domain.name}"`,
                                })
                              }
                            >
                              <CheckCircle className="mr-1 h-3.5 w-3.5" />
                              Verify
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setConfirmAction({
                                  domainId: domain.id,
                                  newStatus: 'pending',
                                  label: `Revoke verification for "${domain.name}"`,
                                })
                              }
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" />
                              Revoke
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
              icon={Globe}
              title="No domains found"
              description="Try adjusting your filters"
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
        open={!!confirmAction}
        onOpenChange={open => !open && setConfirmAction(null)}
        title="Confirm Domain Action"
        description={confirmAction ? confirmAction.label : ''}
        confirmLabel="Confirm"
        variant={confirmAction?.newStatus === 'pending' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (!confirmAction) return;
          updateDomain.mutate(
            { domainId: confirmAction.domainId, data: { status: confirmAction.newStatus } },
            {
              onSuccess: () => {
                toast.success('Domain updated');
                setConfirmAction(null);
              },
              onError: (err: Error) => toast.error(err.message),
            }
          );
        }}
        isPending={updateDomain.isPending}
      />
    </div>
  );
}
