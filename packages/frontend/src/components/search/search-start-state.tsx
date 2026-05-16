import { useRecentIssues, usePublicRecentIssues } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EXAMPLE_SEARCHES } from '@/lib/constants';
import { Search, Sparkles, Clock, Terminal } from 'lucide-react';
import { ResultCard } from '@/components/search/result-card';

interface SearchStartStateProps {
  onSearch: (query: string) => void;
  organizationId?: string;
  issueLinkPrefix?: string;
  searchPath?: string;
}

export function SearchStartState({
  onSearch,
  organizationId,
  issueLinkPrefix,
  searchPath,
}: SearchStartStateProps) {
  const isPublic = !organizationId;
  const privateQuery = useRecentIssues(organizationId, 6);
  const publicQuery = usePublicRecentIssues(6, isPublic);

  const { data, isLoading } = isPublic ? publicQuery : privateQuery;
  const recentIssues = data?.results ?? [];

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-card via-card to-primary/[0.03] p-6 md:p-8">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-accent/5 blur-2xl" />

        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Search className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3
                className="text-lg font-semibold tracking-tight"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                Search the knowledge base
              </h3>
              <p className="text-sm text-muted-foreground">
                Paste an error, describe a problem, or browse recent issues
              </p>
            </div>
          </div>

          {/* Suggested searches */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Suggested searches
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_SEARCHES.map((example, i) => (
                <button
                  key={example}
                  onClick={() => onSearch(example)}
                  className={`group flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-left text-sm transition-all hover:border-primary/30 hover:bg-primary/[0.04] hover:shadow-sm ${i >= 3 ? 'hidden sm:flex' : ''}`}
                >
                  <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" />
                  <span className="text-muted-foreground transition-colors group-hover:text-foreground">
                    {example}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent issues */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
              Recent Issues
            </h3>
            {data?.results.length != null && data.results.length > 0 && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {data.results.length}
              </Badge>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-full" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-18" />
                </div>
              </div>
            ))}
          </div>
        ) : recentIssues.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentIssues.map(issue => (
              <ResultCard
                key={issue.solution_id}
                result={issue}
                compact
                issueLinkPrefix={issueLinkPrefix}
                searchPath={searchPath}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              No issues yet. Submit your first question to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
