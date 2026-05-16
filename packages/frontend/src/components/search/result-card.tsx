import { Link } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Bot, Building2, CheckCircle, ThumbsUp } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import type { SearchResult } from '@/lib/api';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 text-red-500',
  high: 'border-orange-500 text-orange-500',
  medium: 'border-yellow-500 text-yellow-500',
  low: 'border-green-500 text-green-500',
};

const TRUST_COLORS: Record<string, string> = {
  expert: 'bg-purple-500',
  trusted: 'bg-green-500',
  verified: 'bg-blue-500',
};

interface ResultCardProps {
  result: SearchResult;
  compact?: boolean;
  issueLinkPrefix?: string;
  searchPath?: string;
}

export function ResultCard({
  result,
  compact,
  issueLinkPrefix = '/issues/$id',
  searchPath = '/search',
}: ResultCardProps) {
  if (compact)
    return (
      <CompactCard result={result} issueLinkPrefix={issueLinkPrefix} searchPath={searchPath} />
    );
  return <FullCard result={result} issueLinkPrefix={issueLinkPrefix} searchPath={searchPath} />;
}

function AgentLink({ result }: { result: SearchResult }) {
  if (!result.author_agent_slug) return null;
  return (
    <Link
      to="/agents/$slug"
      params={{ slug: result.author_agent_slug }}
      className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
      onClick={e => e.stopPropagation()}
    >
      <Bot className="h-3 w-3" />
      {result.author_agent_name ?? result.author_name}
    </Link>
  );
}

function OrgBadge({ result }: { result: SearchResult }) {
  if (!result.organization_name) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Building2 className="h-3 w-3" />
      {result.organization_name}
    </span>
  );
}

function FullCard({
  result,
  issueLinkPrefix,
  searchPath,
}: {
  result: SearchResult;
  issueLinkPrefix: string;
  searchPath: string;
}) {
  const relevancePercent = result.relevance != null ? Math.round(result.relevance * 100) : null;

  return (
    <Link to={issueLinkPrefix} params={{ id: result.issue_id }}>
      <Card className="group relative overflow-hidden border-l-2 border-l-transparent transition-all hover:border-l-primary hover:bg-muted/50 hover:shadow-lg hover:shadow-primary/5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br from-primary/5 to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />

        <CardContent className="relative p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <h3
                className="truncate font-semibold leading-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {result.title}
              </h3>
              {result.is_accepted && <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
              <ThumbsUp className="h-3.5 w-3.5" />
              <span className="text-xs font-medium tabular-nums">{result.votes}</span>
            </div>
          </div>

          {/* Summary */}
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{result.summary}</p>

          {/* Metadata badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {result.metadata?.project && (
              <Badge variant="outline" className="text-xs">
                {result.metadata.project}
              </Badge>
            )}
            {result.metadata?.errorType && (
              <Badge variant="outline" className="text-xs capitalize">
                {result.metadata.errorType}
              </Badge>
            )}
            {result.metadata?.severity && (
              <Badge
                variant="outline"
                className={`text-xs capitalize ${SEVERITY_COLORS[result.metadata.severity] ?? ''}`}
              >
                {result.metadata.severity}
              </Badge>
            )}
            {result.metadata?.complexity && (
              <Badge variant="outline" className="text-xs capitalize">
                {result.metadata.complexity}
              </Badge>
            )}
            {result.metadata?.techStack?.map(tech => (
              <Badge key={tech} variant="secondary" className="text-xs">
                {tech}
              </Badge>
            ))}
          </div>

          {/* Relevance bar */}
          {relevancePercent != null && (
            <div className="mt-3 flex items-center gap-3">
              <Progress value={relevancePercent} className="h-1.5 flex-1" />
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                Relevance {relevancePercent}%
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <AgentLink result={result} />
            {!result.author_agent_slug && result.author_name && (
              <span className="flex items-center gap-1">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${TRUST_COLORS[result.author_trust_level] ?? 'bg-gray-400'}`}
                />
                {result.author_name}
              </span>
            )}
            <OrgBadge result={result} />
            {result.tags.length > 0 && (
              <>
                <span className="text-border">|</span>
                {result.tags.map(tag => (
                  <Link
                    key={tag}
                    to={searchPath}
                    search={{ tags: [tag] }}
                    onClick={e => e.stopPropagation()}
                  >
                    <Badge
                      variant="secondary"
                      className="text-xs font-normal transition-colors hover:bg-primary/15 hover:text-primary"
                    >
                      {tag}
                    </Badge>
                  </Link>
                ))}
              </>
            )}
            <span className="ml-auto">{formatRelativeTime(result.timestamp)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompactCard({
  result,
  issueLinkPrefix,
  searchPath,
}: {
  result: SearchResult;
  issueLinkPrefix: string;
  searchPath: string;
}) {
  return (
    <Link
      to={issueLinkPrefix}
      params={{ id: result.issue_id }}
      className="group relative block overflow-hidden rounded-lg border border-border/60 p-3 transition-all hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm sm:p-4"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-16 w-16 rounded-full bg-gradient-to-br from-primary/5 to-transparent opacity-0 blur-xl transition-opacity group-hover:opacity-100" />

      <div className="relative">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-1 text-sm font-medium leading-snug transition-colors group-hover:text-primary sm:line-clamp-2">
            {result.title}
          </h4>
          {result.is_accepted && <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />}
        </div>

        {/* Summary */}
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground sm:mt-1.5">
          {result.summary}
        </p>

        {/* Footer: agent/org + tags + votes */}
        <div className="mt-2 flex items-center justify-between gap-2 sm:mt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <AgentLink result={result} />
            <OrgBadge result={result} />
            {result.tags.slice(0, 2).map(tag => (
              <Link
                key={tag}
                to={searchPath}
                search={{ tags: [tag] }}
                onClick={e => e.stopPropagation()}
              >
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[11px] font-normal transition-colors hover:bg-primary/15 hover:text-primary"
                >
                  {tag}
                </Badge>
              </Link>
            ))}
            {result.metadata?.severity && (
              <Badge
                variant="outline"
                className={`hidden px-1.5 py-0 text-[11px] capitalize sm:inline-flex ${
                  result.metadata.severity === 'critical'
                    ? 'border-red-500/40 text-red-500'
                    : result.metadata.severity === 'high'
                      ? 'border-orange-500/40 text-orange-500'
                      : ''
                }`}
              >
                {result.metadata.severity}
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:gap-3">
            <span className="flex items-center gap-1 tabular-nums">
              <ThumbsUp className="h-3 w-3" />
              {result.votes}
            </span>
            <span className="hidden sm:inline">{formatRelativeTime(result.timestamp)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
