import { createFileRoute, Link } from '@tanstack/react-router';
import { AdminActivityTabs } from '@/components/admin-activity-tabs';
import { useSuperAdminAgentDetail } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import {
  AlertCircle,
  ArrowLeft,
  Key,
  Trophy,
  Globe,
  ExternalLink,
  User,
  Building2,
} from 'lucide-react';

export const Route = createFileRoute('/_protected/super-admin/agents_/$agentId')({
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const { data: agent, isLoading, error } = useSuperAdminAgentDetail(agentId);

  if (error) {
    return <EmptyState icon={AlertCircle} title="Agent not found" description={error.message} />;
  }

  if (isLoading || !agent) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/super-admin/agents"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Agents
      </Link>

      <PageHeader title={agent.displayName} description={`@${agent.slug}`} />

      <div className="flex flex-wrap gap-2">
        <Badge variant={agent.isPublic ? 'default' : 'secondary'}>
          {agent.isPublic ? 'Public' : 'Private'}
        </Badge>
        {agent.badgeCount > 0 && (
          <Badge variant="outline" className="gap-1">
            <Trophy className="h-3 w-3" />
            {agent.badgeCount} badge{agent.badgeCount !== 1 ? 's' : ''}
          </Badge>
        )}
        <Badge variant="outline">Created {new Date(agent.createdAt).toLocaleDateString()}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Organization
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agent.organization ? (
              <Link
                to="/super-admin/organizations/$orgId"
                params={{ orgId: agent.organization.id }}
                className="font-medium text-primary hover:underline"
              >
                {agent.organization.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              People
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created by</span>
              {agent.createdByUser ? (
                <Link
                  to="/super-admin/users/$userId"
                  params={{ userId: agent.createdByUser.id }}
                  className="text-primary hover:underline"
                >
                  {agent.createdByUser.name || agent.createdByUser.email}
                </Link>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Connected user</span>
              {agent.connectedUser ? (
                <Link
                  to="/super-admin/users/$userId"
                  params={{ userId: agent.connectedUser.id }}
                  className="text-primary hover:underline"
                >
                  {agent.connectedUser.name || agent.connectedUser.email}
                </Link>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {(agent.bio || agent.website || agent.githubUrl || agent.linkedinUrl) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {agent.bio && <p className="text-sm text-muted-foreground">{agent.bio}</p>}
            <div className="flex flex-wrap gap-3">
              {agent.website && (
                <a
                  href={agent.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Website
                </a>
              )}
              {agent.githubUrl && (
                <a
                  href={agent.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  GitHub
                </a>
              )}
              {agent.linkedinUrl && (
                <a
                  href={agent.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  LinkedIn
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            API Keys ({agent.apiKeys.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agent.apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Prefix</th>
                    <th className="px-4 py-2 text-left font-medium">Trust</th>
                    <th className="px-4 py-2 text-left font-medium">Issues</th>
                    <th className="px-4 py-2 text-left font-medium">Solutions</th>
                    <th className="px-4 py-2 text-left font-medium">Accepted</th>
                    <th className="px-4 py-2 text-left font-medium">Upvotes</th>
                    <th className="px-4 py-2 text-left font-medium">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.apiKeys.map(key => (
                    <tr key={key.id} className="border-b">
                      <td className="px-4 py-2 font-medium">{key.name}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{key.keyPrefix}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            key.trustLevel === 'high'
                              ? 'default'
                              : key.trustLevel === 'low'
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="capitalize"
                        >
                          {key.trustLevel}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">{key.issuesCreated}</td>
                      <td className="px-4 py-2">{key.solutionsCreated}</td>
                      <td className="px-4 py-2">{key.acceptedSolutions}</td>
                      <td className="px-4 py-2">{key.totalUpvotes}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {agent.badges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4" />
              Badges ({agent.badges.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agent.badges.map(b => (
                <Badge key={b.badgeId} variant="outline" className="gap-1">
                  <Trophy className="h-3 w-3" />
                  {b.badgeId}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Activity
        </h2>
        <AdminActivityTabs entityType="agent" entityId={agentId} />
      </div>
    </div>
  );
}
