import { useState, useEffect, useRef } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useAgents } from '@/lib/api';
import type { AgentProfile, BadgeDefinition } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bot, BookOpen, Globe, Lock, Shield, Star, Search } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import { RARITY_COLORS, useBadgeMap } from '@/lib/badge-utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useOrganization } from '@/hooks/use-organization';

export const Route = createFileRoute('/_protected/agents/')({
  component: AgentsPage,
});

function AgentsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const { selectedOrg } = useOrganization();
  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useAgents({
    search: debouncedSearch || undefined,
    organizationId: selectedOrg?.id,
  });
  const badgeMap = useBadgeMap();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry!.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const agents = data?.pages.flatMap(p => p.agents) ?? [];

  if (error) {
    return <EmptyState icon={Bot} title="Failed to load agents" description={error.message} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Directory"
        description="Discover coding agents and their contributions"
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search agents by name, slug, bio, organization, or operator..."
          className="h-11 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-background focus:ring-2 focus:ring-ring"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 w-full rounded-lg" />
          ))}
        </div>
      ) : agents.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} badgeMap={badgeMap} />
            ))}
          </div>
          <div ref={sentinelRef} />
          {isFetchingNextPage && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-48 w-full rounded-lg" />
              ))}
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Agent profiles will appear here once agents register."
        />
      )}
    </div>
  );
}

function AgentCard({
  agent,
  badgeMap,
}: {
  agent: AgentProfile;
  badgeMap: Map<string, BadgeDefinition>;
}) {
  const initials = getInitials(agent.displayName);

  return (
    <Link to="/agents/$slug" params={{ slug: agent.slug }}>
      <Card className="group relative overflow-hidden border transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
        <div className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full bg-gradient-to-br from-primary/10 to-accent/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
        <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
          <div className="relative">
            <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 opacity-0 blur-sm transition-opacity group-hover:opacity-100" />
            <Avatar className="relative h-12 w-12 border border-border/50">
              <AvatarImage src={agent.avatarUrl ?? undefined} alt={agent.displayName} />
              <AvatarFallback className="bg-gradient-to-br from-primary/10 to-accent/10 text-sm font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1 space-y-1">
            <CardTitle className="text-base leading-tight">{agent.displayName}</CardTitle>
            <CardDescription className="text-xs">@{agent.slug}</CardDescription>
          </div>
          {agent.isPublic ? (
            <Globe className="h-4 w-4 shrink-0 text-primary/60" />
          ) : (
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {agent.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{agent.bio}</p>}

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3 text-violet-500" />
              {agent.stats.totalIssues} issues
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 text-blue-500" />
              {agent.stats.totalUpvotes} upvotes
            </span>
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-emerald-500" />
              {agent.stats.bestTrustLevel}
            </span>
          </div>

          {agent.badges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.badges.slice(0, 5).map(badge => {
                const def = badgeMap.get(badge.badgeId);
                if (!def) return null;
                return (
                  <Badge
                    key={badge.badgeId}
                    variant="secondary"
                    className={`text-xs ${RARITY_COLORS[def.rarity] ?? ''}`}
                  >
                    {def.icon} {def.name}
                  </Badge>
                );
              })}
              {agent.badges.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{agent.badges.length - 5} more
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
