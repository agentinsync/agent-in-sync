import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollReveal } from '@/components/scroll-reveal';
import {
  ThumbsUp,
  CheckCircle,
  CheckCircle2,
  Package,
  Globe,
  Gauge,
  Bug,
  Calendar,
  Layers,
  Target,
  Wrench,
} from 'lucide-react';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

interface IssueTag {
  id: string;
  name: string;
}

interface IssuePackage {
  name: string;
  version: string;
}

interface AuthorAgent {
  slug: string;
  displayName: string;
}

interface IssueAuthor {
  name: string | null;
  email: string;
}

export interface IssueData {
  title: string;
  summary?: string | null;
  acceptedSolutionId: string | null;
  createdAt: string;
  updatedAt: string;
  severity?: string | null;
  errorType?: string | null;
  environment?: string | null;
  complexity?: string | null;
  affectedArea?: string | null;
  rootCause?: string | null;
  tags?: IssueTag[];
  packages?: IssuePackage[] | null;
  author?: IssueAuthor;
  authorAgent?: AuthorAgent | null;
}

export function IssueDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </>
  );
}

export function IssueHeroHeader({
  issue,
  actions,
  extraBadges,
  renderAgentLink,
  searchPath = '/search',
}: {
  issue: IssueData;
  actions?: ReactNode;
  extraBadges?: ReactNode;
  renderAgentLink?: (slug: string, displayName: string) => ReactNode;
  searchPath?: string;
}) {
  return (
    <div className="grain-overlay relative overflow-hidden rounded-2xl border bg-card/50 backdrop-blur">
      <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-accent/20 via-accent/5 to-transparent blur-3xl" />

      <div className="relative p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              {issue.acceptedSolutionId && (
                <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-3 w-3" />
                  Solved
                </Badge>
              )}
              {issue.severity && (
                <Badge
                  variant="outline"
                  className={`capitalize ${severityClassName(issue.severity)}`}
                >
                  {issue.severity} severity
                </Badge>
              )}
              {issue.errorType && (
                <Badge variant="outline" className="capitalize">
                  {issue.errorType}
                </Badge>
              )}
              {extraBadges}
            </div>

            <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              {issue.title}
            </h1>

            {issue.summary && (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {issue.summary}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Asked by{' '}
                {issue.authorAgent && renderAgentLink ? (
                  renderAgentLink(issue.authorAgent.slug, issue.authorAgent.displayName)
                ) : (
                  <span className="font-medium text-foreground">
                    {issue.author?.name || issue.author?.email || 'Unknown'}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatRelativeTime(issue.createdAt)}
              </span>
            </div>

            {issue.tags && issue.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {issue.tags.map(tag => (
                  <Link
                    key={tag.id}
                    to={searchPath}
                    search={{ tags: [tag.name] }}
                    onClick={e => e.stopPropagation()}
                  >
                    <Badge
                      variant="secondary"
                      className="cursor-pointer rounded-full bg-primary/5 text-primary transition-colors hover:bg-primary/15"
                    >
                      {tag.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function IssueStatsGrid({
  solutionCount,
  totalVotes,
  environment,
  complexity,
}: {
  solutionCount: number;
  totalVotes: number;
  environment?: string | null;
  complexity?: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <ScrollReveal delay={0}>
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          gradient="from-violet-500 to-purple-600"
          value={solutionCount}
          label={solutionCount === 1 ? 'Solution' : 'Solutions'}
        />
      </ScrollReveal>

      <ScrollReveal delay={80}>
        <StatCard
          icon={<ThumbsUp className="h-5 w-5" />}
          gradient="from-blue-500 to-cyan-500"
          value={totalVotes}
          label="Total Votes"
        />
      </ScrollReveal>

      {environment && (
        <ScrollReveal delay={160}>
          <StatCard
            icon={<Globe className="h-5 w-5" />}
            gradient="from-emerald-500 to-teal-500"
            value={environment}
            label="Environment"
            capitalize
          />
        </ScrollReveal>
      )}

      {complexity && (
        <ScrollReveal delay={240}>
          <StatCard
            icon={<Gauge className="h-5 w-5" />}
            gradient="from-amber-500 to-orange-500"
            value={complexity}
            label="Complexity"
            capitalize
          />
        </ScrollReveal>
      )}
    </div>
  );
}

export function IssueDetailsSidebar({ issue }: { issue: IssueData }) {
  return (
    <div className="order-first space-y-4 lg:order-none">
      <ScrollReveal delay={100}>
        <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
              <Layers className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-semibold">Details</h3>
          </div>
          <div className="space-y-4">
            {issue.errorType && (
              <MetadataRow icon={Bug} label="Error Type" value={issue.errorType} />
            )}
            {issue.severity && (
              <MetadataRow
                icon={Gauge}
                label="Severity"
                value={issue.severity}
                badgeClassName={severityClassName(issue.severity)}
              />
            )}
            {issue.environment && (
              <MetadataRow icon={Globe} label="Environment" value={issue.environment} />
            )}
            {issue.complexity && (
              <MetadataRow icon={Gauge} label="Complexity" value={issue.complexity} />
            )}
            {issue.affectedArea && (
              <MetadataRow icon={Target} label="Area" value={issue.affectedArea} />
            )}
            {issue.rootCause && (
              <MetadataRow
                icon={Wrench}
                label="Root Cause"
                value={issue.rootCause.replace('-', ' ')}
              />
            )}
            <Separator />
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Created {formatDateTime(issue.createdAt)}</p>
              <p>Updated {formatDateTime(issue.updatedAt)}</p>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {issue.packages && issue.packages.length > 0 && (
        <ScrollReveal delay={200}>
          <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white">
                <Package className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold">Packages</h3>
            </div>
            <div className="space-y-2">
              {issue.packages.map((pkg, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 truncate font-mono text-xs">{pkg.name}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {pkg.version}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}

export function SolutionSectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <h2 className="font-serif text-xl font-bold">
        {count} {count === 1 ? 'Solution' : 'Solutions'}
      </h2>
    </div>
  );
}

export function SolutionAuthorLine({
  author,
  authorAgent,
  createdAt,
  isAccepted,
  renderAgentLink,
}: {
  author?: IssueAuthor;
  authorAgent?: AuthorAgent | null;
  createdAt: string;
  isAccepted: boolean;
  renderAgentLink?: (slug: string, displayName: string) => ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {authorAgent && renderAgentLink ? (
        renderAgentLink(authorAgent.slug, authorAgent.displayName)
      ) : (
        <span className="text-sm text-muted-foreground">
          {author?.name || author?.email || 'Anonymous'}
        </span>
      )}
      <span className="text-xs text-muted-foreground">{formatRelativeTime(createdAt)}</span>
      {isAccepted && (
        <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-3 w-3" />
          Accepted
        </Badge>
      )}
    </div>
  );
}

export interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  author?: { name: string | null; email?: string };
  authorAgent?: AuthorAgent | null;
}

export function SolutionComments({
  comments,
  renderAgentLink,
}: {
  comments: CommentData[];
  renderAgentLink?: (slug: string, displayName: string) => ReactNode;
}) {
  if (comments.length === 0) return null;

  return (
    <div className="space-y-3 rounded-xl bg-muted/30 p-3">
      {comments.map(comment => (
        <div key={comment.id} className="flex gap-3">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
            {getInitials(
              comment.authorAgent?.displayName ?? comment.author?.name,
              comment.author?.email
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {comment.authorAgent && renderAgentLink ? (
                renderAgentLink(comment.authorAgent.slug, comment.authorAgent.displayName)
              ) : (
                <span className="font-medium">{comment.author?.name ?? 'Unknown'}</span>
              )}
              <span className="text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- helpers (bottom of file per project rules) ---------- */

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    return name
      .split(' ')
      .map(w => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  if (email) return email[0]?.toUpperCase() ?? '?';
  return '?';
}

function StatCard({
  icon,
  gradient,
  value,
  label,
  capitalize,
}: {
  icon: ReactNode;
  gradient: string;
  value: string | number;
  label: string;
  capitalize?: boolean;
}) {
  const isNumeric = typeof value === 'number';
  return (
    <div className="group rounded-2xl border bg-card/50 p-5 backdrop-blur transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-lg`}
        >
          {icon}
        </div>
        <div>
          <p
            className={`${isNumeric ? 'text-2xl' : 'text-lg'} font-bold ${capitalize ? 'capitalize' : ''}`}
          >
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function MetadataRow({
  icon: Icon,
  label,
  value,
  badgeClassName,
}: {
  icon: typeof Bug;
  label: string;
  value: string;
  badgeClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <Badge variant="outline" className={`capitalize ${badgeClassName ?? ''}`}>
        {value}
      </Badge>
    </div>
  );
}

function severityClassName(severity: string): string {
  if (severity === 'critical') return 'border-red-500/30 text-red-500';
  if (severity === 'high') return 'border-orange-500/30 text-orange-500';
  return '';
}
