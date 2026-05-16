import { createFileRoute, Link } from '@tanstack/react-router';
import { useDashboardStats, useApiKeys } from '@/lib/api';
import { useOrganization } from '@/hooks/use-organization';
import { CLI_SETUP_COMMAND } from '@/lib/config-templates';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { CopyButton } from '@/components/copy-button';
import {
  Key,
  MessageSquare,
  AlertCircle,
  Plus,
  Search,
  Building2,
  ArrowRight,
  Plug,
  Sparkles,
  Terminal,
  Bot,
  BookOpen,
  Clock,
} from 'lucide-react';
import { ResultCard } from '@/components/search/result-card';
import { searchParamsDefaults } from '@/lib/search-params';
import { useWikiPages } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/dashboard')({
  component: DashboardPage,
});

function DashboardPage() {
  const { selectedOrg, organizations: orgs } = useOrganization();
  const { data: stats, isLoading, error } = useDashboardStats(selectedOrg?.id);
  const { data: apiKeys } = useApiKeys();
  const { data: wikiData, isLoading: wikiLoading } = useWikiPages(selectedOrg?.id, { limit: 50 });
  const totalWikiPages = wikiData?.results.length ?? 0;
  const recentWikiPages = wikiData?.results.slice(0, 3) ?? [];

  const hasNoApiKeys = apiKeys && apiKeys.length === 0;

  if (error) {
    return (
      <EmptyState icon={AlertCircle} title="Failed to load dashboard" description={error.message} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your AgentInSync activity" />

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link to="/search" search={searchParamsDefaults}>
          <Button variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Issue
          </Button>
        </Link>
        <Link to="/search" search={searchParamsDefaults}>
          <Button variant="outline" size="sm">
            <Search className="mr-2 h-4 w-4" />
            Search
          </Button>
        </Link>
        <Link to="/api-keys">
          <Button variant="outline" size="sm">
            <Key className="mr-2 h-4 w-4" />
            API Keys
          </Button>
        </Link>
        <Link to="/wiki-browse">
          <Button variant="outline" size="sm">
            <BookOpen className="mr-2 h-4 w-4" />
            Wiki
          </Button>
        </Link>
      </div>

      {/* Onboarding card for users without API keys */}
      {hasNoApiKeys && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Get Started with AgentInSync</CardTitle>
            </div>
            <CardDescription>Connect your AI coding assistant in just a few steps</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Terminal className="h-3.5 w-3.5" />
                  Quick start with the CLI
                </p>
                <div className="relative">
                  <CopyButton value={CLI_SETUP_COMMAND} className="absolute right-2 top-2" />
                  <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-xs sm:text-sm">
                    <code>$ {CLI_SETUP_COMMAND}</code>
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  Detects your agents, authenticates, and writes the MCP config automatically.
                </p>
              </div>
              <Link to="/connect">
                <Button variant="outline" size="sm">
                  <Plug className="mr-2 h-4 w-4" />
                  Or configure manually
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Link to="/api-keys" className="block">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Keys</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.totalApiKeys ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Active keys for agent access</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link to="/search" search={searchParamsDefaults} className="block">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.totalIssues ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Questions in the system</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link to="/organizations" className="block">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{orgs?.length ?? 0}</div>
                  <p className="text-xs text-muted-foreground">Teams you belong to</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link to="/wiki-browse" className="block">
          <Card className="transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Wiki Pages</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {wikiLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">
                    {totalWikiPages}
                    {wikiData?.hasMore ? '+' : ''}
                  </div>
                  <p className="text-xs text-muted-foreground">Knowledge base pages</p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent issues */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Issues</CardTitle>
            <CardDescription>Latest questions submitted to the system</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : stats?.recentIssues && stats.recentIssues.length > 0 ? (
              <div className="space-y-2 md:space-y-3">
                {stats.recentIssues.map(result => (
                  <ResultCard key={result.solution_id} result={result} compact />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">
                No issues yet. Submit your first question!
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right column: Wiki + Connected Agents + Organizations */}
        <div className="space-y-6">
          {/* Wiki widget */}
          <WikiWidget pages={recentWikiPages} isLoading={wikiLoading} />

          {/* Connected Agents widget */}
          <ConnectedAgentsWidget apiKeys={apiKeys} />

          {/* Organization widget */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {orgs && orgs.length > 0 ? (
                <div className="space-y-3">
                  {orgs.slice(0, 3).map(org => (
                    <Link
                      key={org.id}
                      to="/organizations/$slug"
                      params={{ slug: org.slug }}
                      className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="font-medium text-sm">{org.name}</div>
                      <div className="text-xs text-muted-foreground">{org.slug}</div>
                    </Link>
                  ))}
                  {orgs.length > 3 && (
                    <Link
                      to="/organizations"
                      className="flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      View all
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">No organizations yet</p>
                  <Link to="/organizations">
                    <Button variant="outline" size="sm" className="mt-2">
                      <Plus className="mr-2 h-4 w-4" />
                      Join or Create
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WikiWidget({
  pages,
  isLoading,
}: {
  pages: { slug: string; title: string; updatedAt: string; project: string | null }[];
  isLoading: boolean;
}) {
  const formatDate = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Wiki
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : pages.length > 0 ? (
          <div className="space-y-2">
            {pages.map(page => (
              <Link
                key={page.slug}
                to="/wiki-browse/$slug"
                params={{ slug: page.slug }}
                className="flex items-start justify-between rounded-lg border p-2.5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{page.title}</div>
                  {page.project && (
                    <div className="text-xs text-muted-foreground">{page.project}</div>
                  )}
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(page.updatedAt)}
                </div>
              </Link>
            ))}
            <Link
              to="/wiki-browse"
              className="flex items-center gap-1 pt-1 text-sm text-primary hover:underline"
            >
              View all pages
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">No wiki pages yet</p>
            <Link to="/wiki-browse/new">
              <Button variant="outline" size="sm" className="mt-2">
                <Plus className="mr-2 h-4 w-4" />
                Create first page
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConnectedAgentsWidget({
  apiKeys,
}: {
  apiKeys:
    | {
        id: string;
        name: string;
        agent: { id: string; slug: string; displayName: string } | null;
        lastUsedAt: string | null;
      }[]
    | undefined;
}) {
  const keysWithAgents = apiKeys?.filter(k => k.agent) ?? [];

  const isActive = (lastUsedAt: string | null) => {
    if (!lastUsedAt) return false;
    const diff = Date.now() - new Date(lastUsedAt).getTime();
    return diff < 24 * 60 * 60 * 1000;
  };

  const formatLastUsed = (lastUsedAt: string | null) => {
    if (!lastUsedAt) return 'Never';
    const diff = Date.now() - new Date(lastUsedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Connected Agents
        </CardTitle>
      </CardHeader>
      <CardContent>
        {keysWithAgents.length > 0 ? (
          <div className="space-y-3">
            {keysWithAgents.slice(0, 5).map(key => (
              <div key={key.id} className="flex items-center gap-3 text-sm">
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${isActive(key.lastUsedAt) ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{key.agent!.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatLastUsed(key.lastUsedAt)}
                  </div>
                </div>
              </div>
            ))}
            <Link
              to="/connect"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plug className="h-3 w-3" />
              Connect more
            </Link>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">No agents connected yet</p>
            <Link to="/connect">
              <Button variant="outline" size="sm" className="mt-2">
                <Plug className="mr-2 h-4 w-4" />
                Connect Agent
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
