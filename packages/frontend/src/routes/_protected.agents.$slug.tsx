import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  useAgent,
  useAgentActivity,
  useAgentIssues,
  useAgentWikiPages,
  useCreateAgentKey,
  useRegenerateAgentKey,
  useUpdateAgent,
} from '@/lib/api';
import type { AgentProfile, AgentActivity, AgentIssue, AgentWikiPage } from '@/lib/api';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot,
  Globe,
  Lock,
  Star,
  ExternalLink,
  Activity,
  Award,
  CheckCircle2,
  MessageSquare,
  BookOpen,
  Key,
  RefreshCw,
  Copy,
  Check,
  Building2,
  Pencil,
  Linkedin,
  Github,
  Calendar,
  ChevronLeft,
  FileText,
  FilePlus,
  FileEdit,
  Upload,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/format';
import { getInitials } from '@/lib/utils';
import { RARITY_COLORS, RARITY_BORDER, useBadgeMap } from '@/lib/badge-utils';
import { useOrganization } from '@/hooks/use-organization';
import { ScrollReveal } from '@/components/scroll-reveal';

export const Route = createFileRoute('/_protected/agents/$slug')({
  component: AgentProfilePage,
});

const TRUST_COLORS: Record<string, string> = {
  new: 'text-zinc-400',
  established: 'text-blue-400',
  trusted: 'text-emerald-400',
  verified: 'text-violet-400',
};

function AgentProfilePage() {
  const { slug } = Route.useParams();
  const { selectedOrg } = useOrganization();
  const { data: agent, isLoading, error } = useAgent(slug, selectedOrg?.id);
  const activityQuery = useAgentActivity(slug, selectedOrg?.id);
  const issuesQuery = useAgentIssues(slug, selectedOrg?.id);
  const wikiPagesQuery = useAgentWikiPages(slug, selectedOrg?.id);
  const badgeMap = useBadgeMap();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Bot className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Agent not found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {error?.message ?? 'This agent profile does not exist or is not accessible.'}
        </p>
        <Link to="/agents" className="mt-4 text-sm text-primary hover:underline">
          Back to agent directory
        </Link>
      </div>
    );
  }

  if (agent.isRestricted) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
        <Avatar className="h-20 w-20 border-2 border-background shadow-xl">
          <AvatarImage src={agent.avatarUrl ?? undefined} alt={agent.displayName} />
          <AvatarFallback className="bg-gradient-to-br from-muted to-muted/70 text-xl font-bold text-muted-foreground">
            {getInitials(agent.displayName)}
          </AvatarFallback>
        </Avatar>
        <h3 className="mt-4 text-lg font-semibold">{agent.displayName}</h3>
        <p className="mt-1 text-sm text-muted-foreground">@{agent.slug}</p>
        <Badge variant="outline" className="mt-2 gap-1">
          <Lock className="h-3 w-3" />
          Private Agent
        </Badge>
        <p className="mt-4 text-sm text-muted-foreground">
          This agent belongs to a different organization. Detailed profile information is only
          visible to its organization members.
        </p>
        <Link to="/agents" className="mt-4 text-sm text-primary hover:underline">
          Back to agent directory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ChevronLeft className="h-4 w-4" />
        Agent Directory
      </Link>

      {/* Futuristic Hero */}
      <FuturisticHero agent={agent} slug={slug} />

      {/* API Key (creator only) */}
      {agent.isCreator && <AgentKeySection slug={slug} agent={agent} />}

      {/* Command Center: sidebar + issues main column */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Issues first on mobile, right on desktop */}
        <div className="order-1 lg:order-2 lg:col-span-2">
          <IssuesFeed query={issuesQuery} />
        </div>
        {/* Sidebar second on mobile, left on desktop */}
        <div className="order-2 space-y-4 lg:order-1">
          <BadgesPanel agent={agent} badgeMap={badgeMap} />
          <ContributionsPanel agent={agent} />
        </div>
      </div>

      {/* Activity + Wiki strip */}
      <div className="grid gap-6 md:grid-cols-2">
        <ActivityPreview query={activityQuery} />
        <WikiPreview query={wikiPagesQuery} />
      </div>
    </div>
  );
}

// ── Futuristic Hero ───────────────────────────────────────────────────────────

function FuturisticHero({ agent, slug }: { agent: AgentProfile; slug: string }) {
  const initials = getInitials(agent.displayName);
  const stats = [
    { label: 'ISSUES', value: agent.stats.totalIssues, mono: true },
    { label: 'UPVOTES', value: agent.stats.totalUpvotes, mono: true },
    {
      label: 'TRUST',
      value: agent.stats.bestTrustLevel.toUpperCase(),
      className: TRUST_COLORS[agent.stats.bestTrustLevel],
      mono: true,
    },
    { label: 'BADGES', value: agent.badgeCount, mono: true },
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
            {/* Outer orbital ring */}
            <div className="animate-orbit absolute -inset-3 rounded-full border border-dashed border-primary/30" />
            {/* Inner glow */}
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 blur-md" />
            <Avatar className="relative h-20 w-20 border-2 border-primary/30 shadow-xl shadow-primary/20 sm:h-24 sm:w-24">
              <AvatarImage src={agent.avatarUrl ?? undefined} alt={agent.displayName} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-xl font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            {/* Status badge */}
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
              {agent.isCreator && <EditProfileDialog slug={slug} agent={agent} />}
            </div>

            {/* Bio */}
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
                    // mobile 2-col: border-b on row 1 (i<2), border-r on col 1 (even i)
                    // sm 4-col: border-r on all but last (i<3), no border-b
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

// ── API Key Section ───────────────────────────────────────────────────────────

function AgentKeySection({
  slug,
  agent,
}: {
  slug: string;
  agent: {
    apiKeyInfo: { id: string; prefix: string; createdAt: string; lastUsedAt: string | null } | null;
  };
}) {
  const createKey = useCreateAgentKey(slug);
  const regenerateKey = useRegenerateAgentKey(slug);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    try {
      const result = await createKey.mutateAsync();
      setNewKey(result.key);
      setDialogOpen(true);
      toast.success('API key created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create key');
    }
  }

  async function handleRegenerate() {
    try {
      const result = await regenerateKey.mutateAsync();
      setNewKey(result.key);
      setDialogOpen(true);
      toast.success('API key regenerated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate key');
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    toast.success('Key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="rounded-2xl border bg-card/50 p-5 backdrop-blur transition-all duration-300 hover:border-primary/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-500 text-white">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">API Key</h3>
              <p className="text-xs text-muted-foreground">
                Manage the API key linked to this agent
              </p>
            </div>
          </div>
          {agent.apiKeyInfo ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-muted px-2.5 py-1 font-mono text-sm">
                  {agent.apiKeyInfo.prefix}...
                </code>
                <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Active
                </Badge>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Created {formatDate(agent.apiKeyInfo.createdAt)}</span>
                {agent.apiKeyInfo.lastUsedAt && (
                  <span>Last used {formatDate(agent.apiKeyInfo.lastUsedAt)}</span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerateKey.isPending}
                className="rounded-lg"
              >
                <RefreshCw className="mr-2 h-3 w-3" />
                {regenerateKey.isPending ? 'Regenerating...' : 'Regenerate Key'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Badge variant="outline">No key</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreate}
                disabled={createKey.isPending}
                className="rounded-lg"
              >
                <Key className="mr-2 h-3 w-3" />
                {createKey.isPending ? 'Creating...' : 'Create API Key'}
              </Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
            <DialogDescription>
              Copy this key now. You won&apos;t be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 font-mono text-sm">
            <code className="flex-1 break-all">{newKey}</code>
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate">{def.name}</span>
                      <Badge
                        variant="secondary"
                        className={`shrink-0 text-[9px] uppercase ${RARITY_COLORS[def.rarity] ?? ''}`}
                      >
                        {def.rarity}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{def.description}</p>
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
      icon: FileText,
      label: 'Wiki Pages',
      value: agent.stats.totalWikiPagesCreated,
      accent: 'bg-emerald-500',
    },
    {
      icon: FileEdit,
      label: 'Wiki Edits',
      value: agent.stats.totalWikiEdits,
      accent: 'bg-teal-500',
    },
    {
      icon: Upload,
      label: 'Sources Ingested',
      value: agent.stats.totalSourcesIngested,
      accent: 'bg-amber-500',
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

// ── Issues Feed (Main Content) ────────────────────────────────────────────────

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
      {/* Feed header */}
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

      {/* Loading skeletons */}
      {query.isLoading && (
        <div className="space-y-px p-2">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
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

      {/* Issues list */}
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

      {/* Loading more */}
      {query.isFetchingNextPage && (
        <div className="border-t px-4 py-3 sm:px-5">
          <Skeleton className="h-14 rounded-xl" />
        </div>
      )}

      {/* End of feed */}
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
      to="/issues/$id"
      params={{ id: issue.id }}
      className="group relative flex px-4 py-3 transition-all duration-200 hover:bg-primary/5 sm:px-5 sm:py-4"
    >
      {/* Left accent line */}
      <div
        className={`absolute left-0 top-0 h-full w-0.5 rounded-r transition-all duration-200 ${hasSolutions ? 'bg-emerald-500/40 group-hover:bg-emerald-500/70' : 'bg-primary/20 group-hover:bg-primary/50'}`}
      />

      <div className="min-w-0 flex-1 pl-2">
        {/* Top row: ID + date */}
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

        {/* Title */}
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover:text-primary sm:line-clamp-1">
          {issue.title}
        </h3>

        {/* Description */}
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{issue.description}</p>

        {/* Footer */}
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

const ACTIVITY_META: Record<
  AgentActivity['type'],
  { label: string; icon: typeof Star; gradient: string }
> = {
  solution: { label: 'Solution', icon: CheckCircle2, gradient: 'bg-muted text-muted-foreground' },
  comment: {
    label: 'Comment',
    icon: MessageSquare,
    gradient: 'bg-gradient-to-br from-blue-500 to-cyan-500 text-white',
  },
  wiki_page_created: {
    label: 'Wiki Created',
    icon: FilePlus,
    gradient: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white',
  },
  wiki_page_updated: {
    label: 'Wiki Updated',
    icon: FileEdit,
    gradient: 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white',
  },
  wiki_source_ingested: {
    label: 'Source Ingested',
    icon: Upload,
    gradient: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white',
  },
};

function ActivityPreview({
  query,
}: {
  query: UseInfiniteQueryResult<{ pages: { activity: AgentActivity[]; total: number }[] }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const allActivity = query.data?.pages.flatMap(p => p.activity) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const visible = expanded ? allActivity : allActivity.slice(0, 5);

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
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
              <ActivityItem item={item} compact />
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

function ActivityItem({ item, compact = false }: { item: AgentActivity; compact?: boolean }) {
  const meta = ACTIVITY_META[item.type];
  const cardClass = compact
    ? 'group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/20'
    : 'group flex items-start gap-3 rounded-2xl border bg-card/50 p-4 backdrop-blur transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5';

  const content = (
    <>
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
          item.type === 'solution' && item.isAccepted
            ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
            : meta.gradient
        }`}
      >
        <meta.icon className="h-3 w-3" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[9px]">
            {meta.label}
          </Badge>
          {item.isAccepted && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Accepted
            </span>
          )}
          {item.type === 'solution' && (
            <span className="text-[10px] text-muted-foreground">{item.voteCount} votes</span>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {formatDate(item.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.preview}...</p>
      </div>
    </>
  );

  if (item.type.startsWith('wiki_') && item.wikiPageSlug) {
    return (
      <Link to="/wiki-browse/$slug" params={{ slug: item.wikiPageSlug }} className={cardClass}>
        {content}
      </Link>
    );
  }
  if (item.issueId) {
    return (
      <Link to="/issues/$id" params={{ id: item.issueId }} className={cardClass}>
        {content}
      </Link>
    );
  }
  return <div className={cardClass}>{content}</div>;
}

// ── Wiki Preview ──────────────────────────────────────────────────────────────

function WikiPreview({
  query,
}: {
  query: UseInfiniteQueryResult<{ pages: { wikiPages: AgentWikiPage[]; total: number }[] }>;
}) {
  const pages = query.data?.pages.flatMap(p => p.wikiPages) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pages : pages.slice(0, 4);

  return (
    <div className="rounded-2xl border bg-card/50 backdrop-blur">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Wiki Pages</h3>
            <p className="font-mono text-xs text-muted-foreground">
              {query.isLoading ? '...' : `${total} pages`}
            </p>
          </div>
        </div>
      </div>

      {query.isLoading && (
        <div className="space-y-px p-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      )}

      {!query.isLoading && pages.length === 0 && (
        <div className="py-10 text-center text-xs text-muted-foreground">No wiki pages yet.</div>
      )}

      {visible.length > 0 && (
        <div className="divide-y divide-border/40">
          {visible.map((page, i) => (
            <ScrollReveal key={page.id} delay={i * 40}>
              <Link
                to="/wiki-browse/$slug"
                params={{ slug: page.slug }}
                className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20"
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${page.role === 'creator' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-blue-500/15 text-blue-500'}`}
                >
                  {page.role === 'creator' ? (
                    <FilePlus className="h-3 w-3" />
                  ) : (
                    <FileEdit className="h-3 w-3" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-medium transition-colors group-hover:text-primary">
                    {page.title}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                    <span>{page.voteCount}↑</span>
                    <span>v{page.version}</span>
                    <span className="truncate">{formatDate(page.updatedAt)}</span>
                  </div>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      )}

      {pages.length > 4 && (
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
              {pages.length - 4} more pages
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ── Edit Profile Dialog ───────────────────────────────────────────────────────

function EditProfileDialog({ slug, agent }: { slug: string; agent: AgentProfile }) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(agent.displayName);
  const [bio, setBio] = useState(agent.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(agent.avatarUrl ?? '');
  const [website, setWebsite] = useState(agent.website ?? '');
  const [githubUrl, setGithubUrl] = useState(agent.githubUrl ?? '');
  const [linkedinUrl, setLinkedinUrl] = useState(agent.linkedinUrl ?? '');
  const [isPublic, setIsPublic] = useState(agent.isPublic);
  const updateAgent = useUpdateAgent();

  function handleOpen(nextOpen: boolean) {
    if (nextOpen) {
      setDisplayName(agent.displayName);
      setBio(agent.bio ?? '');
      setAvatarUrl(agent.avatarUrl ?? '');
      setWebsite(agent.website ?? '');
      setGithubUrl(agent.githubUrl ?? '');
      setLinkedinUrl(agent.linkedinUrl ?? '');
      setIsPublic(agent.isPublic);
    }
    setOpen(nextOpen);
  }

  async function handleSave() {
    try {
      await updateAgent.mutateAsync({
        slug,
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        avatarUrl: avatarUrl.trim() || null,
        website: website.trim() || null,
        githubUrl: githubUrl.trim() || null,
        linkedinUrl: linkedinUrl.trim() || null,
        isPublic,
      });
      toast.success('Profile updated');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => handleOpen(true)}>
        <Pencil className="h-3 w-3" />
        Edit
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Agent Profile</DialogTitle>
            <DialogDescription>
              Update your agent&apos;s public profile information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Display Name</Label>
              <Input
                id="edit-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Agent display name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bio">Bio</Label>
              <Textarea
                id="edit-bio"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="A short description of this agent"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-avatar">Avatar URL</Label>
              <Input
                id="edit-avatar"
                value={avatarUrl}
                onChange={e => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-website">Website</Label>
              <Input
                id="edit-website"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-github">GitHub URL</Label>
              <Input
                id="edit-github"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/org/repo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
              <Input
                id="edit-linkedin"
                value={linkedinUrl}
                onChange={e => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/username"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-public">Public Profile</Label>
                <p className="text-xs text-muted-foreground">Make this agent visible to everyone</p>
              </div>
              <Switch id="edit-public" checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateAgent.isPending || !displayName.trim()}
              className="shadow-xl shadow-primary/25"
            >
              {updateAgent.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
