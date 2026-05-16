import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import {
  useExportData,
  useDeletionStatus,
  useRequestDeletion,
  useCancelDeletion,
  useConfirmDeletion,
} from '@/lib/api';
import { useOrganization } from '@/hooks/use-organization';
import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PageHeader } from '@/components/page-header';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  Building2,
  Github,
  Sun,
  Moon,
  Monitor,
  Download,
  Shield,
  Trash2,
  AlertTriangle,
  Loader2,
  Link2,
} from 'lucide-react';

export const Route = createFileRoute('/_protected/account')({
  component: AccountPage,
});

function AccountPage() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { organizations: orgs } = useOrganization();

  const exportData = useExportData();
  const { data: deletionStatus } = useDeletionStatus();
  const requestDeletion = useRequestDeletion();
  const cancelDeletion = useCancelDeletion();
  const confirmDeletion = useConfirmDeletion();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [deletionToken, setDeletionToken] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState('');

  const initials =
    user?.name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    '?';

  function handleRequestDeletion() {
    requestDeletion.mutate(undefined, {
      onSuccess: data => {
        setDeletionToken(data.token);
        setDeleteDialogOpen(false);
        setConfirmDialogOpen(true);
      },
    });
  }

  function handleConfirmDeletion() {
    if (!deletionToken) return;
    confirmDeletion.mutate(deletionToken, {
      onSuccess: () => {
        setConfirmDialogOpen(false);
        signOut();
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Account" description="Manage your profile and preferences" />

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? ''} />
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold">{user?.name || 'User'}</h3>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? (
                <Moon className="h-4 w-4" />
              ) : theme === 'light' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
              <span className="text-sm">Theme</span>
            </div>
            <Select value={theme} onValueChange={v => setTheme(v as 'light' | 'dark' | 'system')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Connected accounts */}
      <ConnectedAccountsCard />

      {/* Organizations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Organizations
          </CardTitle>
          <CardDescription>Your organization memberships</CardDescription>
        </CardHeader>
        <CardContent>
          {orgs && orgs.length > 0 ? (
            <div className="space-y-3">
              {orgs.map(org => (
                <div
                  key={org.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium text-sm">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </div>
                  {org.role && (
                    <Badge variant="secondary" className="capitalize">
                      {org.role}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              You are not a member of any organizations.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Privacy & Data */}
      <Card id="privacy">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Privacy & Data
          </CardTitle>
          <CardDescription>Manage your personal data and privacy settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Export My Data</p>
              <p className="text-xs text-muted-foreground">
                Download all your personal data as JSON
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportData.mutate()}
              disabled={exportData.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              {exportData.isPending ? 'Exporting...' : 'Export'}
            </Button>
          </div>
          {exportData.isError && (
            <p className="text-xs text-destructive">Export failed. Please try again later.</p>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible account actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deletionStatus?.hasPending ? (
            <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Deletion request pending
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Your account is scheduled for deletion
                    {deletionStatus.expiresAt &&
                      ` on ${new Date(deletionStatus.expiresAt).toLocaleDateString()}`}
                    . You can cancel this request before the deadline.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => cancelDeletion.mutate()}
                    disabled={cancelDeletion.isPending}
                  >
                    {cancelDeletion.isPending ? 'Cancelling...' : 'Cancel Deletion'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Delete Account</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete your account and anonymize your data
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request deletion dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This will initiate account deletion with a 7-day cooling-off period. Your personal
              data will be anonymized, but community contributions (issues, solutions, comments)
              will be preserved with an anonymized author.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 text-sm">
            <p className="font-medium">What will happen:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
              <li>Your name, email, and profile image will be removed</li>
              <li>All sessions and API keys will be revoked</li>
              <li>Your organization memberships will be removed</li>
              <li>Content you authored will be attributed to &quot;[deleted]&quot;</li>
            </ul>
          </div>
          {requestDeletion.isError && (
            <p className="text-sm text-destructive">
              {requestDeletion.error?.message?.includes('already')
                ? 'A deletion request is already pending.'
                : 'Failed to request deletion. Please try again.'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRequestDeletion}
              disabled={requestDeletion.isPending}
            >
              {requestDeletion.isPending ? 'Requesting...' : 'Request Deletion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm deletion dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm account deletion</DialogTitle>
            <DialogDescription>
              A deletion request has been created. To confirm immediate deletion, type
              &quot;DELETE&quot; below. Or close this dialog to wait for the 7-day cooling-off
              period.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
            <Input
              id="confirm-delete"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="DELETE"
              className="mt-2"
            />
          </div>
          {confirmDeletion.isError && (
            <p className="text-sm text-destructive">
              Failed to confirm deletion. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Wait for cooling-off
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletion}
              disabled={confirmInput !== 'DELETE' || confirmDeletion.isPending}
            >
              {confirmDeletion.isPending ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const PROVIDERS = [
  {
    id: 'github',
    name: 'GitHub',
    icon: <Github className="h-5 w-5" />,
  },
  {
    id: 'google',
    name: 'Google',
    icon: <GoogleIcon />,
  },
] as const;

function ConnectedAccountsCard() {
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  const {
    data: accounts,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['linked-accounts'],
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if (result.error) throw new Error(result.error.message);
      return result.data ?? [];
    },
  });

  const connectedProviders = new Set(accounts?.map(a => a.providerId) ?? []);

  async function handleLink(providerId: string) {
    setLinkingProvider(providerId);
    try {
      await authClient.linkSocial({
        provider: providerId as 'github' | 'google',
        callbackURL: '/account',
      });
    } finally {
      setLinkingProvider(null);
      refetch();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>OAuth providers linked to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {PROVIDERS.map((provider, i) => {
            const connected = connectedProviders.has(provider.id);
            const isLinking = linkingProvider === provider.id;
            return (
              <div key={provider.id}>
                {i > 0 && <Separator className="mb-4" />}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {provider.icon}
                    <div>
                      <p className="text-sm font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {connected ? 'Connected to your account' : `Sign in with ${provider.name}`}
                      </p>
                    </div>
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-6 w-20" />
                  ) : connected ? (
                    <Badge variant="default" className="gap-1">
                      <Link2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleLink(provider.id)}
                      disabled={isLinking}
                    >
                      {isLinking ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
