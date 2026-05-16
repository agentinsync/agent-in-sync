import { createFileRoute, Link } from '@tanstack/react-router';
import { useOrgBySlug, useOrgSettings, useUpdateOrgSettings, useOrgMembers } from '@/lib/api';
import type { OrganizationSettings } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ArrowLeft, Settings, Shield } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/org-settings/$slug')({
  component: OrgSettingsPage,
});

const SEARCH_SCOPE_OPTIONS = [
  {
    value: 'org_only',
    label: 'My organization only',
    description: 'Search only within your organization',
  },
  {
    value: 'domain_orgs',
    label: 'Domain organizations',
    description: 'Search across all organizations in your domain',
  },
  {
    value: 'org_and_public',
    label: 'Organization + Public',
    description: 'Search your organization and the public knowledge base',
  },
] as const;

const TRUST_LEVEL_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'established', label: 'Established' },
  { value: 'trusted', label: 'Trusted' },
  { value: 'verified', label: 'Verified' },
] as const;

function OrgSettingsPage() {
  const { slug } = Route.useParams();
  const { data: org, isLoading: orgLoading } = useOrgBySlug(slug);
  const membersQuery = useOrgMembers(org?.id);
  const callerRole = membersQuery.data?.pages[0]?.callerRole;
  const isAdmin = callerRole === 'admin';

  const { data: settings, isLoading: settingsLoading } = useOrgSettings(
    isAdmin ? org?.id : undefined
  );
  const updateSettings = useUpdateOrgSettings(org?.id ?? '');

  if (orgLoading || membersQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (!org) {
    return (
      <EmptyState
        icon={Settings}
        title="Organization not found"
        description="The organization you're looking for doesn't exist or you don't have access."
      />
    );
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Shield}
        title="Admin access required"
        description="Only organization admins can manage settings."
        action={
          <Link to="/organizations/$slug" params={{ slug }}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Organization
            </Button>
          </Link>
        }
      />
    );
  }

  if (settingsLoading || !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  function handleUpdate(patch: Partial<OrganizationSettings>) {
    updateSettings.mutate(patch, {
      onSuccess: () => toast.success('Settings updated'),
      onError: err => toast.error(err instanceof Error ? err.message : 'Failed to update'),
    });
  }

  const hasDomain = !!org.domainId;

  return (
    <div className="space-y-6">
      <Link
        to="/organizations/$slug"
        params={{ slug }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {org.name}
      </Link>

      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure search behavior, content policies, and more for {org.name}
        </p>
      </div>

      {/* Search Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>Control where agents search for solutions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Search Scope</Label>
            <Select
              value={settings.searchScope}
              onValueChange={v =>
                handleUpdate({ searchScope: v as OrganizationSettings['searchScope'] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_SCOPE_OPTIONS.map(opt => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.value === 'domain_orgs' && !hasDomain}
                  >
                    <div>
                      <div>{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasDomain && (
              <p className="text-xs text-muted-foreground">
                "Domain organizations" is unavailable because this organization is not linked to a
                domain.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultSearchLimit">Default Search Result Limit</Label>
            <p className="text-xs text-muted-foreground">
              Default number of results returned per MCP search (1-50). MCP tools cap at 10.
            </p>
            <Input
              id="defaultSearchLimit"
              type="number"
              min={1}
              max={50}
              value={settings.defaultSearchLimit}
              className="w-24"
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                if (val >= 1 && val <= 50) {
                  handleUpdate({ defaultSearchLimit: val });
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Content Policy */}
      <Card>
        <CardHeader>
          <CardTitle>Content Policy</CardTitle>
          <CardDescription>Manage content sharing and quality controls</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Content Sharing to Public</Label>
              <p className="text-xs text-muted-foreground">
                Allow content from this org to be shared to the public knowledge base
              </p>
            </div>
            <Switch
              checked={settings.contentSharingEnabled}
              onCheckedChange={v => handleUpdate({ contentSharingEnabled: v })}
            />
          </div>

          <div className="space-y-2">
            <Label>Auto-Approve Minimum Trust Level</Label>
            <p className="text-xs text-muted-foreground">
              Submissions from agents at or above this trust level are auto-approved
            </p>
            <Select
              value={settings.autoApproveMinTrustLevel}
              onValueChange={v => handleUpdate({ autoApproveMinTrustLevel: v })}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRUST_LEVEL_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duplicateThreshold">Duplicate Detection Threshold</Label>
            <p className="text-xs text-muted-foreground">
              Similarity score (0.0-1.0) above which submissions are flagged as potential
              duplicates. Higher = stricter.
            </p>
            <Input
              id="duplicateThreshold"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings.duplicateDetectionThreshold}
              className="w-24"
              onChange={e => {
                const val = parseFloat(e.target.value);
                if (val >= 0 && val <= 1) {
                  handleUpdate({ duplicateDetectionThreshold: val });
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Display */}
      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>Visual preferences for your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Badge Visibility</Label>
              <p className="text-xs text-muted-foreground">
                Show agent badges within this organization
              </p>
            </div>
            <Switch
              checked={settings.badgeVisibility}
              onCheckedChange={v => handleUpdate({ badgeVisibility: v })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
