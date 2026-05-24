import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  useAvailableOrganizations,
  useDomainInfo,
  useJoinOrganization,
  useMyOrganizations,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Globe, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/welcome')({
  component: WelcomePage,
});

export function WelcomePage() {
  const navigate = useNavigate();
  const { data: myOrgs = [], isLoading: myOrgsLoading } = useMyOrganizations();
  const { data: availableOrgs = [], isLoading: availableLoading } = useAvailableOrganizations();
  const { data: domainInfo } = useDomainInfo();
  const joinOrg = useJoinOrganization();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const isLoading = myOrgsLoading || availableLoading;
  const hasChoices = availableOrgs.length > 0;

  const autoJoined = useMemo(() => {
    const publicOrg = myOrgs.find(o => o.isPublic);
    const domainOrgs = myOrgs.filter(o => !o.isPublic && o.domainId);
    return { publicOrg, domainOrgs };
  }, [myOrgs]);

  useEffect(() => {
    if (isLoading) return;
    if (!hasChoices) {
      navigate({ to: '/dashboard', replace: true });
    }
  }, [isLoading, hasChoices, navigate]);

  function toggle(orgId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) {
      navigate({ to: '/dashboard' });
      return;
    }

    setSubmitting(true);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map(id => joinOrg.mutateAsync(id)));
    const failed = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      toast.error(
        failed === ids.length
          ? 'Failed to join organizations'
          : `Joined ${ids.length - failed} of ${ids.length} organizations`
      );
    } else {
      toast.success(`Joined ${ids.length} organization${ids.length === 1 ? '' : 's'}`);
    }

    setSubmitting(false);
    navigate({ to: '/dashboard' });
  }

  function handleSkip() {
    navigate({ to: '/dashboard' });
  }

  if (isLoading || !hasChoices) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to Agent in Sync</h1>
        <p className="mt-2 text-muted-foreground">Let's get you set up with the right teams.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">You're already in</CardTitle>
          <CardDescription>
            We've added you to these by default — you can leave them later from settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {autoJoined.publicOrg && (
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{autoJoined.publicOrg.name}</p>
                <p className="text-xs text-muted-foreground">Shared community knowledge base</p>
              </div>
            </div>
          )}
          {autoJoined.domainOrgs.map(org => (
            <div key={org.id} className="flex items-center gap-3 rounded-md border p-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{org.name}</p>
                <p className="text-xs text-muted-foreground">
                  Default team for {domainInfo?.domain?.name ?? 'your domain'}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Join other teams in your domain</CardTitle>
          <CardDescription>
            {domainInfo?.domain?.name
              ? `Other organizations exist for ${domainInfo.domain.name}. Pick any you want to join.`
              : 'Pick any organizations you want to join.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {availableOrgs.map(org => {
            const checked = selected.has(org.id);
            return (
              <label
                key={org.id}
                htmlFor={`org-${org.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  id={`org-${org.id}`}
                  checked={checked}
                  onCheckedChange={() => toggle(org.id)}
                />
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">{org.slug}</p>
                </div>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {org.memberCount}
                </span>
              </label>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" onClick={handleSkip} disabled={submitting} className="flex-1">
          Skip for now
        </Button>
        <Button onClick={handleContinue} disabled={submitting} className="flex-1">
          {submitting
            ? 'Joining...'
            : selected.size === 0
              ? 'Continue'
              : `Join ${selected.size} and continue`}
        </Button>
      </div>
    </div>
  );
}
