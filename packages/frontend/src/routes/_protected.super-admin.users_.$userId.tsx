import { createFileRoute, Link } from '@tanstack/react-router';
import { AdminActivityTabs } from '@/components/admin-activity-tabs';
import { useSuperAdminUserDetail, useUpdateUser } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Key,
  Shield,
  Trophy,
  ThumbsUp,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/super-admin/users_/$userId')({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { userId } = Route.useParams();
  const { data: user, isLoading, error } = useSuperAdminUserDetail(userId);
  const updateUser = useUpdateUser();
  const [confirmAction, setConfirmAction] = useState<{
    field: string;
    value: boolean | string;
    label: string;
  } | null>(null);

  if (error) {
    return <EmptyState icon={AlertCircle} title="User not found" description={error.message} />;
  }

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  function handleConfirm() {
    if (!confirmAction) return;
    const data: Record<string, unknown> = {};
    data[confirmAction.field] = confirmAction.value;
    updateUser.mutate(
      { userId, data: data as { isSuperAdmin?: boolean; tier?: string } },
      {
        onSuccess: () => {
          toast.success(confirmAction.label);
          setConfirmAction(null);
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/super-admin/users"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Users
      </Link>

      <PageHeader
        title={user.name || user.email}
        description={user.name ? user.email : undefined}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setConfirmAction({
                  field: 'isSuperAdmin',
                  value: !user.isSuperAdmin,
                  label: user.isSuperAdmin ? 'Revoked super-admin' : 'Granted super-admin',
                })
              }
            >
              <Shield className="mr-2 h-4 w-4" />
              {user.isSuperAdmin ? 'Revoke Admin' : 'Grant Admin'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setConfirmAction({
                  field: 'tier',
                  value: user.tier === 'paid' ? 'free' : 'paid',
                  label: `Changed tier to ${user.tier === 'paid' ? 'free' : 'paid'}`,
                })
              }
            >
              {user.tier === 'paid' ? 'Downgrade' : 'Upgrade'} Tier
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant={user.tier === 'paid' ? 'default' : 'secondary'}>{user.tier}</Badge>
        <Badge variant="outline" className="capitalize">
          {user.reputationLevel}
        </Badge>
        {user.isSuperAdmin && <Badge variant="destructive">Super Admin</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatMini icon={Trophy} label="Reputation" value={user.reputationScore} />
        <StatMini icon={FileText} label="Contributions" value={user.totalContributions} />
        <StatMini icon={ThumbsUp} label="Upvotes Received" value={user.totalUpvotesReceived} />
        <StatMini icon={Trophy} label="Accepted Solutions" value={user.totalAcceptedSolutions} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Organizations ({user.memberships.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organization memberships</p>
            ) : (
              <div className="space-y-2">
                {user.memberships.map(m => (
                  <div
                    key={m.organizationId}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div>
                      <Link
                        to="/super-admin/organizations/$orgId"
                        params={{ orgId: m.organizationId }}
                        className="font-medium text-sm hover:underline text-primary"
                      >
                        {m.organizationName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{m.organizationSlug}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {m.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" />
              API Keys ({user.apiKeys.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.apiKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API keys</p>
            ) : (
              <div className="space-y-2">
                {user.apiKeys.map(k => (
                  <div key={k.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{k.name}</span>
                      <Badge variant="outline" className="capitalize">
                        {k.trustLevel}
                      </Badge>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span>{k.keyPrefix}...</span>
                      <span>Score: {k.trustScore}</span>
                      <span>Issues: {k.issuesCreated}</span>
                      <span>Solutions: {k.solutionsCreated}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Last used: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Activity
        </h2>
        <AdminActivityTabs entityType="user" entityId={userId} />
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={open => !open && setConfirmAction(null)}
        title="Confirm Action"
        description={confirmAction ? `Are you sure you want to: ${confirmAction.label}?` : ''}
        confirmLabel="Confirm"
        variant={
          confirmAction?.field === 'isSuperAdmin' && confirmAction?.value === true
            ? 'destructive'
            : 'default'
        }
        onConfirm={handleConfirm}
        isPending={updateUser.isPending}
      />
    </div>
  );
}

function StatMini({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
