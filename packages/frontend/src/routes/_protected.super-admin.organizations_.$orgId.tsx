import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuperAdminOrgDetail, useUpdateOrganization, useDeleteOrganization } from '@/lib/api';
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
  Users,
  MessageSquare,
  CheckCircle,
  Bot,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/super-admin/organizations_/$orgId')({
  component: OrgDetailPage,
});

function OrgDetailPage() {
  const { orgId } = Route.useParams();
  const { data: org, isLoading, error } = useSuperAdminOrgDetail(orgId);
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);

  if (error) {
    return (
      <EmptyState icon={AlertCircle} title="Organization not found" description={error.message} />
    );
  }

  if (isLoading || !org) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/super-admin/organizations"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Organizations
      </Link>

      <PageHeader
        title={org.name}
        description={org.slug}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                updateOrg.mutate(
                  { orgId, data: { isPublic: !org.isPublic } },
                  {
                    onSuccess: () => toast.success(`Set to ${org.isPublic ? 'private' : 'public'}`),
                    onError: (err: Error) => toast.error(err.message),
                  }
                );
              }}
              disabled={updateOrg.isPending}
            >
              {org.isPublic ? (
                <>
                  <EyeOff className="mr-2 h-4 w-4" />
                  Make Private
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Make Public
                </>
              )}
            </Button>
            {!org.isPublic && (
              <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant={org.isPublic ? 'default' : 'secondary'}>
          {org.isPublic ? 'Public' : 'Private'}
        </Badge>
        <Badge variant="outline">Created {new Date(org.createdAt).toLocaleDateString()}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatMini icon={Users} label="Members" value={org.memberCount} />
        <StatMini icon={MessageSquare} label="Issues" value={org.issueCount} />
        <StatMini icon={CheckCircle} label="Solutions" value={org.solutionCount} />
        <StatMini icon={Bot} label="Agents" value={org.agentCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Members ({org.members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {org.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Email</th>
                    <th className="px-4 py-2 text-left font-medium">Role</th>
                    <th className="px-4 py-2 text-left font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {org.members.map(m => (
                    <tr key={m.userId} className="border-b">
                      <td className="px-4 py-2">
                        <Link
                          to="/super-admin/users/$userId"
                          params={{ userId: m.userId }}
                          className="hover:underline text-primary"
                        >
                          {m.userName || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{m.userEmail}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className="capitalize">
                          {m.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(m.joinedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Organization"
        description={`Are you sure you want to delete "${org.name}"? Content will be preserved.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          deleteOrg.mutate(orgId, {
            onSuccess: () => {
              toast.success('Organization deleted');
              navigate({ to: '/super-admin/organizations' });
            },
            onError: (err: Error) => toast.error(err.message),
          });
        }}
        isPending={deleteOrg.isPending}
      />
    </div>
  );
}

function StatMini({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
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
