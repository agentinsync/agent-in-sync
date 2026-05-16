import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuperAdminFlags, useResolveFlag, type SAFlag } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Flag, AlertCircle, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/super-admin/moderation')({
  component: ModerationPage,
});

function ModerationPage() {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<string>('pending');
  const [contentType, setContentType] = useState<string>('all');

  const { data, isLoading, error } = useSuperAdminFlags({
    page,
    limit: 20,
    status: status !== 'all' ? status : undefined,
    contentType: contentType !== 'all' ? contentType : undefined,
  });

  const resolveFlag = useResolveFlag();
  const [resolveTarget, setResolveTarget] = useState<{
    flagId: string;
    reason: string;
  } | null>(null);
  const [resolution, setResolution] = useState<string>('dismissed');

  if (error) {
    return <EmptyState icon={AlertCircle} title="Failed to load" description={error.message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Moderation"
        description="Review flagged content across all organizations"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={v => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={contentType}
          onValueChange={v => {
            setContentType(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="issue">Issue</SelectItem>
            <SelectItem value="solution">Solution</SelectItem>
            <SelectItem value="comment">Comment</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Reason</th>
                  <th className="px-4 py-3 text-left font-medium">Details</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Flagged</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
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
                  : data?.items.map((flag: SAFlag) => (
                      <tr key={flag.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="capitalize">
                            {flag.contentType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 capitalize">{flag.reason.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 max-w-[200px] truncate text-muted-foreground">
                          {flag.details || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {flag.resolvedAt ? (
                            <Badge variant="secondary" className="capitalize">
                              {flag.resolution?.replace(/_/g, ' ')}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Pending</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(flag.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!flag.resolvedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setResolveTarget({
                                  flagId: flag.id,
                                  reason: flag.reason,
                                })
                              }
                            >
                              Resolve
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
              icon={status === 'pending' ? CheckCircle : Flag}
              title={status === 'pending' ? 'No pending flags' : 'No flags found'}
              description={
                status === 'pending'
                  ? 'All content flags have been resolved'
                  : 'Try adjusting your filters'
              }
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

      <Dialog open={!!resolveTarget} onOpenChange={open => !open && setResolveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Flag</DialogTitle>
            <DialogDescription>
              Choose a resolution for this {resolveTarget?.reason?.replace(/_/g, ' ')} flag.
            </DialogDescription>
          </DialogHeader>
          <Select value={resolution} onValueChange={setResolution}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dismissed">Dismiss (no action)</SelectItem>
              <SelectItem value="content_hidden">Hide Content</SelectItem>
              <SelectItem value="author_warned">Warn Author</SelectItem>
              <SelectItem value="author_suspended">Suspend Author</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!resolveTarget) return;
                resolveFlag.mutate(
                  { flagId: resolveTarget.flagId, resolution },
                  {
                    onSuccess: () => {
                      toast.success('Flag resolved');
                      setResolveTarget(null);
                    },
                    onError: (err: Error) => toast.error(err.message),
                  }
                );
              }}
              disabled={resolveFlag.isPending}
            >
              {resolveFlag.isPending ? 'Resolving...' : 'Resolve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
