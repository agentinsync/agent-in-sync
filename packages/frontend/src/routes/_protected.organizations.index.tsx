import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  useAvailableOrganizations,
  useCreateOrganization,
  useJoinOrganization,
  useUserProfile,
} from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useOrganization } from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Building2, Users, ArrowRight, Globe, Lock, Sparkles, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { isFreePeriodActive, FREE_PERIOD_END } from '@agent-in-sync/shared/constants';

export const Route = createFileRoute('/_protected/organizations/')({
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const { user } = useAuth();
  const isSuperAdmin = Boolean((user as Record<string, unknown> | null)?.isSuperAdmin);
  const { organizations: myOrgs, isLoading } = useOrganization();
  const { data: availableOrgs } = useAvailableOrganizations();
  const { data: userProfile } = useUserProfile();
  const createOrg = useCreateOrganization();
  const joinOrg = useJoinOrganization();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const isFreeTier = userProfile?.tier === 'free';
  const freePeriodActive = isFreePeriodActive();
  const canCreateOrg = !isFreeTier || freePeriodActive;

  function handleNameChange(name: string) {
    setOrgName(name);
    setOrgSlug(
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    );
  }

  async function handleCreate() {
    if (!orgName.trim() || !orgSlug.trim()) {
      toast.error('Please fill in name and slug');
      return;
    }
    try {
      await createOrg.mutateAsync({ name: orgName, slug: orgSlug });
      toast.success('Organization created');
      setIsCreateOpen(false);
      setOrgName('');
      setOrgSlug('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create organization');
    }
  }

  async function handleJoin(orgId: string) {
    try {
      await joinOrg.mutateAsync(orgId);
      toast.success('Joined organization');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to join organization');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizations"
        description="Manage your organization memberships"
        action={
          canCreateOrg ? (
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Organization
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Private Organization</DialogTitle>
                  <DialogDescription>
                    Create a private organization for your team. Content will be isolated from
                    public view.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Name</Label>
                    <Input
                      id="orgName"
                      placeholder="My Team"
                      value={orgName}
                      onChange={e => handleNameChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="orgSlug">Slug</Label>
                    <Input
                      id="orgSlug"
                      placeholder="my-team"
                      value={orgSlug}
                      onChange={e => setOrgSlug(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      URL-friendly identifier. Lowercase letters, numbers, and hyphens only.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={createOrg.isPending}>
                    {createOrg.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Button variant="outline" disabled>
              <Lock className="mr-2 h-4 w-4" />
              Upgrade to Create
            </Button>
          )
        }
      />

      {/* Free tier info card */}
      {isFreeTier && freePeriodActive && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-green-600" />
              <CardTitle className="text-base">
                Free Access — Create Private Organizations
              </CardTitle>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                Until{' '}
                {FREE_PERIOD_END.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Badge>
            </div>
            <CardDescription>
              For a limited time, all features are free. Create private organizations and keep your
              content confidential — no upgrade required.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      {isFreeTier && !freePeriodActive && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Free Tier - Public Organization</CardTitle>
            </div>
            <CardDescription>
              On the free tier, all your content goes to the public organization and is visible to
              everyone. This helps build a shared knowledge base for the community.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Upgrade to create private organizations and keep your content confidential.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My organizations */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">My Organizations</h2>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : myOrgs && myOrgs.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myOrgs.map(org => {
              const isRestricted = org.isPublic && !isSuperAdmin;
              const card = (
                <Card
                  className={
                    isRestricted
                      ? 'cursor-default opacity-75'
                      : 'transition-colors hover:bg-muted/50'
                  }
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{org.name}</h3>
                          {org.isPublic ? (
                            <Badge variant="secondary" className="text-xs">
                              <Globe className="mr-1 h-3 w-3" />
                              Public
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              <Lock className="mr-1 h-3 w-3" />
                              Private
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{org.slug}</p>
                      </div>
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                      {org.role && <span className="capitalize">{org.role}</span>}
                      {!isRestricted && org.memberCount !== undefined && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {org.memberCount}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );

              return isRestricted ? (
                <div key={org.id}>{card}</div>
              ) : (
                <Link key={org.id} to="/organizations/$slug" params={{ slug: org.slug }}>
                  {card}
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Building2}
            title="No organizations"
            description="Create an organization or join one from your domain."
          />
        )}
      </div>

      {/* Available organizations */}
      {availableOrgs && availableOrgs.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Available Organizations</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Organizations from your email domain that you can join.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableOrgs.map(org => (
              <Card key={org.id}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{org.name}</h3>
                      <p className="text-sm text-muted-foreground">{org.slug}</p>
                    </div>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {org.memberCount}
                    </span>
                  </div>
                  <Button
                    className="mt-4 w-full"
                    variant="outline"
                    size="sm"
                    onClick={() => handleJoin(org.id)}
                    disabled={joinOrg.isPending}
                  >
                    Join
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
