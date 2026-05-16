import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  usePendingShareRequests,
  useApprovedShareRequests,
  useApproveShareRequest,
  useRejectShareRequest,
  useRevokeShareRequest,
  type ShareRequest,
} from '@/lib/api';
import { useOrganization } from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Share2, CheckCircle, XCircle, AlertCircle, Undo2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/format';

export const Route = createFileRoute('/_protected/share-requests')({
  component: ShareRequestsPage,
});

function ShareRequestsPage() {
  const { selectedOrg } = useOrganization();
  const organizationId = selectedOrg?.id;
  const role = selectedOrg?.role;
  const hasAccess = role === 'admin' || role === 'reviewer';
  const {
    data: requests,
    isLoading,
    error,
  } = usePendingShareRequests(hasAccess ? organizationId : undefined);
  const { data: approvedRequests, isLoading: approvedLoading } = useApprovedShareRequests(
    hasAccess ? organizationId : undefined
  );
  const approve = useApproveShareRequest(organizationId);
  const reject = useRejectShareRequest(organizationId);
  const revoke = useRevokeShareRequest(organizationId);

  const [approveTarget, setApproveTarget] = useState<string | null>(null);
  const [approveReason, setApproveReason] = useState('');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  async function handleApprove() {
    if (!approveTarget) return;
    try {
      await approve.mutateAsync({
        id: approveTarget,
        reason: approveReason || undefined,
      });
      toast.success('Share request approved');
      setApproveTarget(null);
      setApproveReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    try {
      await reject.mutateAsync({ id: rejectTarget, reason: rejectReason });
      toast.success('Share request rejected');
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    try {
      await revoke.mutateAsync({ id: revokeTarget, reason: revokeReason || undefined });
      toast.success('Share revoked — issue moved back to this organization');
      setRevokeTarget(null);
      setRevokeReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke');
    }
  }

  if (!hasAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="Share Requests" description="Review requests to share issues publicly" />
        <EmptyState
          icon={Shield}
          title="Reviewer or admin role required"
          description="You need the reviewer or admin role in this organization to manage share requests. Switch to an organization where you have the appropriate role."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Share Requests" description="Review requests to share issues publicly" />
        <EmptyState
          icon={AlertCircle}
          title="Unable to load share requests"
          description={error.message}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Share Requests" description="Review requests to share issues publicly" />

      <Card>
        <CardHeader>
          <CardTitle>Pending Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : requests && requests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(req => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Link
                        to="/issues/$id"
                        params={{ id: req.issueId }}
                        className="font-medium text-sm hover:underline"
                      >
                        {req.issueTitle || req.issueId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{req.requestedByName || 'Unknown'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatRelativeTime(req.createdAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge variant={req.status as 'pending' | 'approved' | 'rejected'}>
                        {req.status}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setApproveTarget(req.id)}
                            disabled={approve.isPending}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => setRejectTarget(req.id)}
                          >
                            <XCircle className="mr-1 h-3 w-3" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Share2}
              title="No pending share requests"
              description="When team members request to share issues publicly, they will appear here."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shared Issues</CardTitle>
        </CardHeader>
        <CardContent>
          {approvedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : approvedRequests && approvedRequests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Shared By</TableHead>
                  <TableHead>Shared At</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvedRequests.map((req: ShareRequest) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <Link
                        to="/issues/$id"
                        params={{ id: req.issueId }}
                        className="font-medium text-sm hover:underline"
                      >
                        {req.issueTitle || req.issueId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{req.requestedByName || 'Unknown'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {req.reviewedAt ? formatRelativeTime(req.reviewedAt) : '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setRevokeTarget(req.id)}
                        disabled={revoke.isPending}
                      >
                        <Undo2 className="mr-1 h-3 w-3" />
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Share2}
              title="No shared issues"
              description="Approved share requests will appear here. You can revoke a share to move the issue back."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!approveTarget} onOpenChange={open => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Share Request</DialogTitle>
            <DialogDescription>
              Optionally provide a reason for approving this request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for approval (optional)..."
              rows={3}
              value={approveReason}
              onChange={e => setApproveReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approve.isPending}>
              {approve.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectTarget} onOpenChange={open => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Share Request</DialogTitle>
            <DialogDescription>Provide a reason for rejecting this request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for rejection..."
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
              {reject.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revokeTarget} onOpenChange={open => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Share</DialogTitle>
            <DialogDescription>
              This will move the issue back to this organization. It will no longer be visible
              publicly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for revoking (optional)..."
              rows={3}
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoke.isPending}>
              {revoke.isPending ? 'Revoking...' : 'Revoke Share'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
