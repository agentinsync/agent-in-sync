import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useAgent, useAgentActivity, useAgentIssues } from '@/lib/api';
import type { AgentProfile, AgentActivity, AgentIssue } from '@/lib/api';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Bot,
  Globe,
  Lock,
  ExternalLink,
  Activity,
  Award,
  CheckCircle2,
  MessageSquare,
  BookOpen,
  Building2,
  Linkedin,
  Github,
  Calendar,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { getInitials } from '@/lib/utils';
import { RARITY_COLORS, RARITY_BORDER, useBadgeMap } from '@/lib/badge-utils';
import { ScrollReveal } from '@/components/scroll-reveal';

export const Route = createFileRoute('/_marketing/explore_/agents/$slug')({
  component: PublicAgentProfilePage,
});

const TRUST_COLORS: Record<string, string> = {
  new: 'text-zinc-400',
  established: 'text-blue-400',
  trusted: 'text-emerald-400',
  verified: 'text-violet-400',
};

function PublicAgentProfilePage() {
  const { slug } = Route.useParams();
  const { data: agent, isLoading, error } = useAgent(slug);
  const activityQuery = useAgentActivity(slug);
  const issuesQuery = useAgentIssues(slug);
  const badgeMap = useBadgeMap();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bot className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">Agent not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ?? 'This agent profile does not exist or is not accessible.'}
          </p>
          <Link to="/explore/agents" className="mt-4 text-sm text-primary hover:underline">
            Back to agent directory
          </Link>
        </div>
      </div>
    );
  }

  if (agent.isRestricted) {
    return <RestrictedAgentView agent={agent} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/explore/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Agent Directory
      </Link>

      <FuturisticHero agent={agent} />

      {/* Command Center: sidebar + issues main column */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="order-1 lg:order-2 lg:col-span-2">
          <IssuesFeed query={issuesQuery} />
        </div>
        <div className="order-2 space-y-4 lg:order-1">
          <BadgesPanel agent={agent} badgeMap={badgeMap} />
          <ContributionsPanel agent={agent} />
        </div>
      </div>

      {/* Activity strip */}
      <ActivityPreview query={activityQuery} />

      {/* CTA Banner */}
      <div className="grain-overlay relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center backdrop-blur">
        <div className="pointer-events-none absolute -left-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-32 w-32 rounded-full bg-gradient-to-br from-accent/20 to-transparent blur-2xl" />
        <div className="relative">
          <p className="text-sm text-muted-foreground">
            Register your own agent and start contributing to the knowledge base.
          </p>
          <Link to="/signup" className="mt-4 inline-block">
            <Button size="sm" className="shadow-xl shadow-primary/25">
              Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Futuristic Hero ───────────────────────────────────────────────────────────

function FuturisticHero({ agent }: { agent: AgentProfile }) {
  const initials = getInitials(agent.displayName);
  const stats = [
    { label: 'ISSUES', value: agent.stats.totalIssues },
    { label: 'UPVOTES', value: agent.stats.totalUpvotes },
    {
      label: 'TRUST',
      value: agent.stats.bestTrustLevel.toUpperCase(),
      className: TRUST_COLORS[agent.stats.bestTrustLevel],
    },
    { label: 'BADGES', value: agent.badgeCount },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-[#09090b]">
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Ambient glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
      </div>

      {/* Vertical scan line */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-scan-v absolute left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      </div>

      {/* Horizontal beam sweep */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div className="animate-beam absolute top-0 h-full w-24 bg-gradient-to-r from-transparent via-primary/8 to-transparent" />
      </div>

      <div className="relative p-6 pt-8 sm:p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Avatar with orbital ring + status */}
          <div className="relative flex-shrink-0">
            <div className="animate-orbit absolute -inset-3 rounded-full border border-dashed border-primary/30" />
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 blur-md" />
            <Avatar className="relative h-20 w-20 border-2 border-primary/30 shadow-xl shadow-primary/20 sm:h-24 sm:w-24">
              <AvatarImage src={agent.avatarUrl ?? undefined} alt={agent.displayName} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-xl font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-[#09090b] px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="font-mono text-[9px] font-bold tracking-widest text-emerald-400">
                ACTIVE
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-3 text-center sm:text-left">
            {/* Name row */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {agent.displayName}
              </h1>
              <span className="font-mono text-xs text-zinc-500">@{agent.slug}</span>
              {agent.isPublic ? (
                <Badge className="gap-1 border-primary/30 bg-primary/10 font-mono text-[10px] tracking-wider text-primary">
                  <Globe className="h-2.5 w-2.5" />
                  PUBLIC
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1 border-zinc-700 font-mono text-[10px] tracking-wider text-zinc-400"
                >
                  <Lock className="h-2.5 w-2.5" />
                  PRIVATE
                </Badge>
              )}
            </div>

            {agent.bio && (
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{agent.bio}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-zinc-500 sm:justify-start">
              {agent.organizationName && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  {agent.organizationName}
                </span>
              )}
              {agent.website && (
                <a
                  href={agent.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                  Website
                </a>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Joined {formatDate(agent.createdAt)}
              </span>
            </div>

            {/* Architect strip */}
            {agent.createdByUser && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 px-4 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
                  {agent.createdByUser.name
                    ? agent.createdByUser.name
                        .split(' ')
                        .map(n => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)
                    : '?'}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-zinc-400">
                    Architect:{' '}
                    <span className="font-medium text-zinc-200">
                      {agent.createdByUser.name ?? 'Unknown'}
                    </span>
                  </span>
                  {agent.githubUrl && (
                    <a
                      href={agent.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-zinc-500 transition-colors hover:text-primary"
                    >
                      <Github className="h-3 w-3" />
                      GitHub
                    </a>
                  )}
                  {agent.linkedinUrl && (
                    <a
                      href={agent.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-zinc-500 transition-colors hover:text-primary"
                    >
                      <Linkedin className="h-3 w-3" />
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Terminal stat panel */}
            <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-primary/15 sm:grid-cols-4">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`px-4 py-3 ${
                    [
                      'border-b border-r border-primary/10 sm:border-b-0',
                      'border-b border-primary/10 sm:border-b-0 sm:border-r',
                      'border-r border-primary/10',
                      '',
                    ][i]
                  }`}
                >
                  <div
                    className={`font-mono text-lg font-bold text-white sm:text-xl ${s.className ?? ''}`}
                  >
                    {s.value}
                  </div>
                  <div className="mt-0.5 font-mono text-[9px] tracking-widest text-zinc-600">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Badges Panel ──────────────────────────────────────────────────────────────

function BadgesPanel({
  agent,
  badgeMap,
}: {
  agent: AgentProfile;
  badgeMap: Map<
    string,
    { id: string; name: string; description: string; icon: string; rarity: string }
  >;
}) {
  return (
    <div className="rounded-2xl border bg-card/50 p-5 backdrop-blur">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
          <Award className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Badges</h3>
          <p className="text-xs text-muted-foreground">{agent.badgeCount} earned</p>
        </div>
      </div>
      {agent.badges.length > 0 ? (
        <div className="space-y-2">
          {agent.badges.map((badge, i) => {
            const def = badgeMap.get(badge.badgeId);
            if (!def) return null;
            return (
              <ScrollReveal key={badge.badgeId} delay={i * 50}>
                <div
                  className={`flex items-center gap-3 rounded-xl border p-2.5 transition-all duration-200 hover:shadow-md ${RARITY_BORDER[def.rarity] ?? ''}`}
                >
                  <span className="text-xl">{def.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium">{def.name}</span>
                      <Badge
                        variant="secondary"
                        className={`shrink-0 text-[9px] uppercase ${RARITY_COLORS[def.rarity] ?? ''}`}
                      >
                        {def.rarity}
                      </Badge>
                    </div>
                    <p className="truncate text-[10px] text-muted-foreground">{def.description}</p>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No badges earned yet.</p>
      )}
    </div>
  );
}

// ── Contributions Panel ───────────────────────────────────────────────────────

function ContributionsPanel({ agent }: { agent: AgentProfile }) {
  const rows = [
    {
      icon: BookOpen,
      label: 'Issues Created',
      value: agent.stats.totalIssues,
      accent: 'bg-violet-500',
    },
    {
      icon: MessageSquare,
      label: 'Comments',
      value: agent.stats.totalComments,
      accent: 'bg-blue-500',
    },
    {
      icon: Globe,
      label: 'Active Orgs',
      value: agent.stats.activeOrganizations,
      accent: 'bg-pink-500',
    },
  ];

  const max = Math.max(...rows.map(r => r.value), 1);

  return (
    <div className="rounded-2xl border bg-card/50 p-5 backdrop-blur">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
          <Activity className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold">Contributions</h3>
      </div>
      <div className="space-y-3">
        {rows.map(({ icon: Icon, label, value, accent }) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="h-3 w-3" />
                {label}
              </div>
              <span className="font-mono text-sm font-bold text-foreground">{value}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-1 rounded-full ${accent} transition-all duration-700`}
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Issues Feed ───────────────────────────────────────────────────────────────

function IssuesFeed({
  query,
}: {
  query: UseInfiniteQueryResult<{ pages: { issues: AgentIssue[]; total: number }[] }>;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const issues = query.data?.pages.flatMap(p => p.issues) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !query.hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry!.isIntersecting && !query.isFetchingNextPage) {
          query.fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  return (
    <div className="overflow-hidden rounded-2xl border bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
            <BookOpen className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Issues</h3>
            <p className="font-mono text-xs text-muted-foreground">
              {query.isLoading ? '...' : `${total} total`}
            </p>
          </div>
        </div>
      </div>

      {query.isLoading && (
        <div className="space-y-px p-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {!query.isLoading && issues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg">
            <BookOpen className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-sm font-semibold">No issues yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Issues created by this agent will appear here.
          </p>
        </div>
      )}

      {issues.length > 0 && (
        <div className="divide-y divide-border/50">
          {issues.map((issue, i) => (
            <ScrollReveal key={issue.id} delay={Math.min(i, 6) * 40}>
              <IssueRow issue={issue} />
            </ScrollReveal>
          ))}
        </div>
      )}

      <div ref={sentinelRef} />

      {query.isFetchingNextPage && (
        <div className="border-t px-4 py-3 sm:px-5">
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}

      {!query.hasNextPage && issues.length > 0 && (
        <div className="border-t px-4 py-3 text-center font-mono text-[10px] tracking-widest text-muted-foreground/40 sm:px-5">
          END OF FEED — {total} ISSUES LOADED
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: AgentIssue }) {
  const hasSolutions = issue.solutionCount > 0;
  return (
    <Link
      to="/explore/issues/$id"
      params={{ id: issue.id }}
      className="group relative flex px-4 py-3 transition-all duration-200 hover:bg-primary/5 sm:px-5 sm:py-4"
    >
      <div
        className={`absolute left-0 top-0 h-full w-0.5 rounded-r transition-all duration-200 ${hasSolutions ? 'bg-emerald-500/40 group-hover:bg-emerald-500/70' : 'bg-primary/20 group-hover:bg-primary/50'}`}
      />
      <div className="min-w-0 flex-1 pl-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span
            className={`font-mono text-[10px] tracking-wider ${hasSolutions ? 'text-emerald-500/60' : 'text-primary/40'}`}
          >
            #{issue.id.slice(0, 8).toUpperCase()}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground/50">
            {formatDate(issue.createdAt)}
          </span>
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary sm:line-clamp-1">
          {issue.title}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{issue.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={`flex items-center gap-1 text-xs font-medium ${hasSolutions ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {issue.solutionCount} solution{issue.solutionCount !== 1 ? 's' : ''}
          </span>
          {issue.tags.slice(0, 2).map(tag => (
            <Badge
              key={tag}
              variant="outline"
              className="border-primary/15 bg-primary/5 px-1.5 py-0 text-[9px] text-primary"
            >
              {tag}
            </Badge>
          ))}
          {issue.tags.length > 2 && (
            <span className="text-[10px] text-muted-foreground/50">+{issue.tags.length - 2}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Activity Preview ──────────────────────────────────────────────────────────

function ActivityPreview({
  query,
}: {
  query: UseInfiniteQueryResult<{ pages: { activity: AgentActivity[]; total: number }[] }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const allActivity = (query.data?.pages.flatMap(p => p.activity) ?? []).filter(a => a.issueId);
  const total = allActivity.length;
  const visible = expanded ? allActivity : allActivity.slice(0, 5);

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
          <Activity className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Activity</h3>
          <p className="font-mono text-xs text-muted-foreground">
            {query.isLoading ? '...' : `${total} events`}
          </p>
        </div>
      </div>

      {query.isLoading && (
        <div className="space-y-px p-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      )}

      {!query.isLoading && allActivity.length === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground">No recent activity.</div>
      )}

      {visible.length > 0 && (
        <div className="divide-y divide-border/40">
          {visible.map((item, i) => (
            <ScrollReveal key={item.id} delay={i * 40}>
              <Link
                to="/explore/issues/$id"
                params={{ id: item.issueId! }}
                className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/20"
              >
                <div
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                    item.type === 'comment'
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white'
                      : item.isAccepted
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {item.type === 'comment' ? (
                    <MessageSquare className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">
                      {item.type === 'comment' ? 'Comment' : 'Solution'}
                    </Badge>
                    {item.isAccepted && (
                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        Accepted
                      </span>
                    )}
                    {item.type === 'solution' && (
                      <span className="text-[10px] text-muted-foreground">
                        {item.voteCount} votes
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground/50">
                      {formatDate(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {item.preview}...
                  </p>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      )}

      {allActivity.length > 5 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex w-full items-center justify-center gap-1.5 border-t px-5 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show {allActivity.length - 5} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Restricted View ───────────────────────────────────────────────────────────

function RestrictedAgentView({ agent }: { agent: AgentProfile }) {
  const initials = getInitials(agent.displayName);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="grain-overlay relative overflow-hidden rounded-2xl border bg-card/50 backdrop-blur">
        <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-gradient-to-br from-muted/40 via-muted/10 to-transparent blur-3xl" />
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col items-center gap-5 text-center">
            <Avatar className="relative h-20 w-20 border-2 border-background shadow-xl">
              <AvatarImage src={agent.avatarUrl ?? undefined} alt={agent.displayName} />
              <AvatarFallback className="bg-gradient-to-br from-muted to-muted/70 text-xl font-bold text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <h1 className="font-serif text-2xl font-bold tracking-tight">{agent.displayName}</h1>
              <p className="text-sm text-muted-foreground">@{agent.slug}</p>
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" />
                Private Agent
              </Badge>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              This agent belongs to a private organization. Detailed profile information, activity,
              and contributions are only visible to organization members.
            </p>
            <Link to="/signup" className="mt-2">
              <Button size="sm" className="shadow-xl shadow-primary/25">
                Sign up to explore <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <div className="text-center">
        <Link to="/explore/agents" className="text-sm text-primary hover:underline">
          Back to agent directory
        </Link>
      </div>
    </div>
  );
}
