import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  useOrgMembers,
  useOrgBySlug,
  useRemoveOrgMember,
  useRevokeAgentApiKey,
  useUserProfile,
} from '@/lib/api';
import type { OrgMember, AgentSummary } from '@/lib/api';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ArrowLeft,
  Building2,
  Users,
  Calendar,
  Bot,
  Shield,
  Crown,
  UserMinus,
  KeyRound,
  Globe,
  Lock,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import { getInitials } from '@/lib/utils';
import { ScrollReveal } from '@/components/scroll-reveal';
import { toast } from 'sonner';

export const Route = createFileRoute('/_protected/organizations/$slug')({
  component: OrganizationDetailPage,
});

const ROLE_CONFIG = {
  admin: {
    label: 'Admin',
    icon: Crown,
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
  },
  reviewer: {
    label: 'Reviewer',
    icon: Shield,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
  },
  member: {
    label: 'Member',
    icon: Users,
    className: 'bg-muted text-muted-foreground border-border',
  },
} as const;

function OrganizationDetailPage() {
  const { slug } = Route.useParams();
  const { data: userProfile } = useUserProfile();
  const { data: org, isLoading: orgLoading, isError } = useOrgBySlug(slug);

  const membersQuery = useOrgMembers(org?.id);
  const callerRole = membersQuery.data?.pages[0]?.callerRole;
  const isAdmin = callerRole === 'admin';
  const total = membersQuery.data?.pages[0]?.total ?? 0;

  if (orgLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !org) {
    return (
      <EmptyState
        icon={Building2}
        title="Organization not found"
        description="The organization you're looking for doesn't exist or you don't have access."
        action={
          <Link to="/organizations">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Organizations
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <Link
        to="/organizations"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        All Organizations
      </Link>

      {/* Org Hero */}
      <div className="grain-overlay relative overflow-hidden rounded-2xl border bg-card/50 backdrop-blur">
        <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-accent/20 via-accent/5 to-transparent blur-3xl" />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-xl shadow-primary/20">
              <Building2 className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-serif text-3xl font-bold tracking-tight">{org.name}</h1>
                <Badge variant="outline" className="text-xs">
                  {org.isPublic ? (
                    <>
                      <Globe className="mr-1 h-3 w-3" />
                      Public
                    </>
                  ) : (
                    <>
                      <Lock className="mr-1 h-3 w-3" />
                      Private
                    </>
                  )}
                </Badge>
                {org.role && (
                  <Badge
                    className={ROLE_CONFIG[org.role as keyof typeof ROLE_CONFIG]?.className ?? ''}
                  >
                    {org.role}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">@{org.slug}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {total} member{total !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  Created {formatDate(org.createdAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Settings Link */}
      {isAdmin && (
        <Link
          to="/org-settings/$slug"
          params={{ slug }}
          className="flex items-center justify-between rounded-2xl border bg-card/50 p-4 transition-colors hover:bg-accent/50"
        >
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Organization Settings</p>
              <p className="text-xs text-muted-foreground">
                Search scope, result limits, content sharing, and more
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}

      {/* Members Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Members</h2>
          {isAdmin && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Admin View
            </Badge>
          )}
        </div>
        <MembersList
          query={membersQuery}
          orgId={org.id}
          isAdmin={isAdmin}
          currentUserId={userProfile?.id}
        />
      </div>
    </div>
  );
}

function MembersList({
  query,
  orgId,
  isAdmin,
  currentUserId,
}: {
  query: UseInfiniteQueryResult<{
    pages: { members: OrgMember[]; total: number; callerRole: string }[];
  }>;
  orgId: string;
  isAdmin: boolean;
  currentUserId: string | undefined;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const removeMember = useRemoveOrgMember(orgId);
  const revokeKey = useRevokeAgentApiKey(orgId);
  const members = query.data?.pages.flatMap(p => p.members) ?? [];

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !query.hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry!.isIntersecting && !query.isFetchingNextPage) query.fetchNextPage();
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  if (query.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!query.isLoading && members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No members"
        description="This organization has no members yet."
      />
    );
  }

  async function handleRemoveMember(member: OrgMember) {
    try {
      await removeMember.mutateAsync(member.userId);
      toast.success(`${member.userName ?? member.userEmail} removed from organization`);
    } catch {
      toast.error('Failed to remove member');
    }
  }

  async function handleRevokeKey(agent: AgentSummary) {
    try {
      await revokeKey.mutateAsync(agent.id);
      toast.success(`API key revoked for ${agent.displayName}`);
    } catch {
      toast.error('Failed to revoke API key');
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {members.map((member, i) => (
          <ScrollReveal key={member.id} delay={Math.min(i, 6) * 60}>
            <MemberCard
              member={member}
              isAdmin={isAdmin}
              isSelf={member.userId === currentUserId}
              onRemove={() => handleRemoveMember(member)}
              onRevokeKey={handleRevokeKey}
            />
          </ScrollReveal>
        ))}
      </div>
      <div ref={sentinelRef} />
      {query.isFetchingNextPage && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}
    </>
  );
}

function MemberCard({
  member,
  isAdmin,
  isSelf,
  onRemove,
  onRevokeKey,
}: {
  member: OrgMember;
  isAdmin: boolean;
  isSelf: boolean;
  onRemove: () => void;
  onRevokeKey: (agent: AgentSummary) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const roleConfig = ROLE_CONFIG[member.role];
  const initials = getInitials(member.userName ?? member.userEmail);

  function handleRemoveClick() {
    if (confirmRemove) {
      onRemove();
      setConfirmRemove(false);
    } else {
      setConfirmRemove(true);
    }
  }

  return (
    <div className="group flex flex-col gap-4 rounded-2xl border bg-card/50 p-5 backdrop-blur transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
      {/* User Row */}
      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary to-accent opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-20" />
          <Avatar className="relative h-10 w-10 border border-border">
            <AvatarImage src={member.userImage ?? undefined} alt={member.userName ?? ''} />
            <AvatarFallback className="bg-gradient-to-br from-muted to-muted/70 text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">
              {member.userName ?? member.userEmail}
            </span>
            <Badge className={`text-[10px] shrink-0 ${roleConfig.className}`}>
              <roleConfig.icon className="mr-1 h-2.5 w-2.5" />
              {roleConfig.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{member.userEmail}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Joined {formatDate(member.createdAt)}
          </p>
        </div>
        {isAdmin && !isSelf && member.role !== 'admin' && (
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 shrink-0 transition-all ${
              confirmRemove
                ? 'text-destructive opacity-100'
                : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive'
            }`}
            onClick={handleRemoveClick}
            onBlur={() => setConfirmRemove(false)}
            title={confirmRemove ? 'Click again to confirm' : 'Remove member'}
          >
            <UserMinus className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Agents */}
      {member.agents.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Agents
          </p>
          <div className="flex flex-col gap-1.5">
            {member.agents.map(agent => (
              <AgentChip
                key={agent.id}
                agent={agent}
                isAdmin={isAdmin}
                onRevokeKey={() => onRevokeKey(agent)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-2">
          <Bot className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground/60">No agents</span>
        </div>
      )}
    </div>
  );
}

function AgentChip({
  agent,
  isAdmin,
  onRevokeKey,
}: {
  agent: AgentSummary;
  isAdmin: boolean;
  onRevokeKey: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const hasKey = !!agent.apiKeyId;

  function handleRevokeClick() {
    if (confirming) {
      onRevokeKey();
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  }

  return (
    <div className="group/agent flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 transition-colors hover:bg-muted/70">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gradient-to-br from-violet-500 to-purple-600 text-white">
        <Bot className="h-3 w-3" />
      </div>
      <Link
        to="/agents/$slug"
        params={{ slug: agent.slug }}
        className="flex flex-1 items-center gap-2 min-w-0"
      >
        <span className="text-xs font-medium truncate">{agent.displayName}</span>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        {!agent.isPublic && <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50" />}
      </Link>
      {hasKey && (
        <Badge className="shrink-0 border-emerald-500/20 bg-emerald-500/10 text-[9px] text-emerald-600 dark:text-emerald-400">
          Key active
        </Badge>
      )}
      {!hasKey && (
        <Badge variant="outline" className="shrink-0 text-[9px] text-muted-foreground">
          No key
        </Badge>
      )}
      {isAdmin && hasKey && (
        <Button
          variant="ghost"
          size="icon"
          className={`h-5 w-5 shrink-0 transition-all ${
            confirming
              ? 'text-destructive opacity-100'
              : 'text-muted-foreground opacity-0 group-hover/agent:opacity-100 hover:text-destructive'
          }`}
          onClick={handleRevokeClick}
          onBlur={() => setConfirming(false)}
          title={confirming ? 'Click again to confirm revoke' : 'Revoke API key'}
        >
          <KeyRound className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
