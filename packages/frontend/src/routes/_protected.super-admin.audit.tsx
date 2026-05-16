import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuperAdminAuditLog, type SAAuditEntry } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { ScrollText, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/_protected/super-admin/audit')({
  component: AuditLogPage,
});

function AuditLogPage() {
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useSuperAdminAuditLog({ page, limit: 20 });

  if (error) {
    return <EmptyState icon={AlertCircle} title="Failed to load" description={error.message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Track all super-admin actions" />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Actor</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Target</th>
                  <th className="px-4 py-3 text-left font-medium">Details</th>
                  <th className="px-4 py-3 text-left font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <Skeleton className="h-4 w-24" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : data?.items.map((entry: SAAuditEntry) => (
                      <tr key={entry.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="font-medium">{entry.actorName || '—'}</div>
                          <div className="text-xs text-muted-foreground">{entry.actorEmail}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{entry.action.replace(/\./g, ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <span className="capitalize">{entry.targetType}</span>
                          {entry.targetId && (
                            <span className="ml-1 font-mono text-xs">
                              {entry.targetId.slice(0, 8)}...
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">
                          {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {data && data.items.length === 0 && (
            <EmptyState
              icon={ScrollText}
              title="No audit entries"
              description="Actions will appear here as super-admins make changes"
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
