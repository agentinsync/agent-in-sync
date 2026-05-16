import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useSuperAdminUsers, useUpdateUser, type SAUser } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/super-admin/users')({
  component: UsersPage,
});

function UsersPage() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [tier, setTier] = useState<string>('all');
  const [superOnly, setSuperOnly] = useState<string>('all');

  const { data, isLoading, error } = useSuperAdminUsers({
    page,
    limit: 20,
    search: search || undefined,
    tier: tier !== 'all' ? tier : undefined,
    isSuperAdmin: superOnly === 'true' ? true : superOnly === 'false' ? false : undefined,
  });

  const updateUser = useUpdateUser();
  const [confirmAction, setConfirmAction] = useState<{
    userId: string;
    field: string;
    value: boolean | string;
    label: string;
  } | null>(null);

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      setSearch(searchInput);
      setPage(0);
    }
  }

  function handleConfirmAction() {
    if (!confirmAction) return;
    const data: Record<string, unknown> = {};
    data[confirmAction.field] = confirmAction.value;
    updateUser.mutate(
      { userId: confirmAction.userId, data: data as { isSuperAdmin?: boolean; tier?: string } },
      {
        onSuccess: () => {
          toast.success(confirmAction.label + ' updated');
          setConfirmAction(null);
        },
        onError: (err: Error) => toast.error(err.message),
      }
    );
  }

  if (error) {
    return (
      <EmptyState icon={AlertCircle} title="Failed to load users" description={error.message} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Manage all platform users" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="pl-8"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>
        <Select
          value={tier}
          onValueChange={v => {
            setTier(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={superOnly}
          onValueChange={v => {
            setSuperOnly(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="true">Super Admins</SelectItem>
            <SelectItem value="false">Regular</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Tier</th>
                  <th className="px-4 py-3 text-left font-medium">Reputation</th>
                  <th className="px-4 py-3 text-left font-medium">Orgs</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
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
                  : data?.items.map((user: SAUser) => (
                      <tr key={user.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            to="/super-admin/users/$userId"
                            params={{ userId: user.id }}
                            className="hover:underline text-primary"
                          >
                            {user.name || '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-3">
                          <Badge variant={user.tier === 'paid' ? 'default' : 'secondary'}>
                            {user.tier}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 capitalize">{user.reputationLevel}</td>
                        <td className="px-4 py-3">{user.orgCount}</td>
                        <td className="px-4 py-3">
                          {user.isSuperAdmin ? (
                            <Badge variant="destructive">Super Admin</Badge>
                          ) : (
                            <span className="text-muted-foreground">User</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  userId: user.id,
                                  field: 'isSuperAdmin',
                                  value: !user.isSuperAdmin,
                                  label: user.isSuperAdmin ? 'Revoke admin' : 'Grant admin',
                                })
                              }
                            >
                              {user.isSuperAdmin ? 'Revoke' : 'Grant'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setConfirmAction({
                                  userId: user.id,
                                  field: 'tier',
                                  value: user.tier === 'paid' ? 'free' : 'paid',
                                  label: `Change tier to ${user.tier === 'paid' ? 'free' : 'paid'}`,
                                })
                              }
                            >
                              {user.tier === 'paid' ? 'Downgrade' : 'Upgrade'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {data && data.items.length === 0 && (
            <EmptyState
              icon={Users}
              title="No users found"
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
        title="Confirm Action"
        description={confirmAction ? `Are you sure you want to: ${confirmAction.label}?` : ''}
        confirmLabel="Confirm"
        variant={
          confirmAction?.field === 'isSuperAdmin' && confirmAction?.value === true
            ? 'destructive'
            : 'default'
        }
        onConfirm={handleConfirmAction}
        isPending={updateUser.isPending}
      />
    </div>
  );
}
