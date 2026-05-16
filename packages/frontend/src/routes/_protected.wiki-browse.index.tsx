import { createFileRoute } from '@tanstack/react-router';
import {
  BookOpen,
  Search,
  ThumbsUp,
  GitBranch,
  Clock,
  ChevronRight,
  Network,
  RefreshCw,
  Sparkles,
  Loader2,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect } from 'react';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiPages, useWikiSearch, useWikiGraph } from '@/lib/api/wiki';
import type { WikiPageSummary, WikiSearchResult } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/')({
  component: WikiBrowsePage,
});

type PageEntry = WikiPageSummary | WikiSearchResult;

const PROJECT_ACCENT: Record<string, string> = {
  backend: '#f59e0b',
  frontend: '#3b82f6',
  'db-client': '#8b5cf6',
  'mcp-server': '#10b981',
  shared: '#ec4899',
  cli: '#f97316',
};

function projectAccent(project: string | null | undefined) {
  return project ? (PROJECT_ACCENT[project] ?? '#6b7280') : '#6b7280';
}

function WikiBrowsePage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [project, setProject] = useState('all');
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  const isSearching = debouncedQuery.length >= 2;

  const allPagesResult = useWikiPages(orgId, { limit: 50 });
  const { data: graph } = useWikiGraph(orgId);
  const listResult = useWikiPages(orgId, {
    limit: 50,
    project: project === 'all' ? undefined : project,
  });
  const searchResult = useWikiSearch(debouncedQuery, orgId, {
    limit: 20,
    project: project === 'all' ? undefined : project,
  });

  const pages: PageEntry[] = isSearching
    ? (searchResult.data?.results ?? [])
    : (listResult.data?.results ?? []);

  const isLoading = isSearching ? searchResult.isLoading : listResult.isLoading;

  const allPages = allPagesResult.data?.results ?? [];
  const projectFilters = [
    'all',
    ...[...new Set(allPages.map(p => p.project).filter((p): p is string => p != null))].sort(),
  ];

  const totalPages = allPages.length;
  const totalEdits = allPages.reduce((s, p) => s + p.editCount, 0);
  const totalVotes = allPages.reduce((s, p) => s + p.voteCount, 0);
  const totalLinks = graph?.edges.length ?? 0;

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Pages',
            value: totalPages,
            icon: BookOpen,
            color: '#f59e0b',
            bg: 'rgba(245,158,11,0.08)',
          },
          {
            label: 'Total Edits',
            value: totalEdits,
            icon: RefreshCw,
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.08)',
          },
          {
            label: 'Total Votes',
            value: totalVotes,
            icon: ThumbsUp,
            color: '#10b981',
            bg: 'rgba(16,185,129,0.08)',
          },
          {
            label: 'Cross-links',
            value: totalLinks,
            icon: Network,
            color: '#8b5cf6',
            bg: 'rgba(139,92,246,0.08)',
          },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border bg-card/50 p-4 backdrop-blur transition-colors hover:bg-card/80"
              style={{ borderColor: `${stat.color}22` }}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" style={{ color: stat.color }} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</div>
            </div>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search pages…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-16 text-sm
              placeholder:text-muted-foreground/50 outline-none
              focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15 transition-all"
          />
          <kbd
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5
            rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/40 font-mono"
          >
            /
          </kbd>
        </div>

        {/* Project filters */}
        {projectFilters.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {projectFilters.map(p => {
              const accent = p === 'all' ? '#f59e0b' : projectAccent(p);
              const active = project === p;
              return (
                <button
                  key={p}
                  onClick={() => setProject(p)}
                  className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all"
                  style={
                    active
                      ? {
                          borderColor: `${accent}60`,
                          backgroundColor: `${accent}18`,
                          color: accent,
                        }
                      : {
                          borderColor: 'transparent',
                          backgroundColor: 'rgba(128,128,128,0.08)',
                          color: 'hsl(var(--muted-foreground))',
                        }
                  }
                >
                  {p === 'all' ? 'All' : p}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" />
        </div>
      )}

      {!isLoading && pages.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed py-20 text-center">
          <div className="relative mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <Sparkles className="h-7 w-7 text-amber-500/60" />
            </div>
            <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
              0
            </div>
          </div>
          <p className="font-medium">
            {isSearching ? 'No pages match your search' : 'No wiki pages yet'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSearching
              ? 'Try a different query or browse all pages'
              : 'Start building your shared knowledge base'}
          </p>
          <a href="/wiki-browse/new">
            <Button size="sm" className="mt-5 gap-2 bg-amber-500 text-black hover:bg-amber-400">
              <Plus className="h-4 w-4" />
              Create first page
            </Button>
          </a>
        </div>
      )}

      {!isLoading && pages.length > 0 && (
        <div className="space-y-2">
          {isSearching && (
            <p className="text-xs text-muted-foreground/50 pb-1">
              {pages.length} result{pages.length !== 1 ? 's' : ''} for "{query}"
            </p>
          )}
          {pages.map(page => (
            <WikiPageCard key={page.slug} page={page} />
          ))}
        </div>
      )}
    </div>
  );
}

function getInitials(title: string) {
  return title
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

function WikiPageCard({ page }: { page: PageEntry }) {
  const accent = projectAccent(page.project);

  return (
    <a href={`/wiki-browse/${page.slug}`} className="block group">
      <div
        className="relative rounded-xl border bg-card/40 backdrop-blur transition-all duration-200
          hover:bg-card/80 hover:shadow-md overflow-hidden"
        style={{ borderColor: `${accent}20` }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 transition-all duration-200 group-hover:w-1"
          style={{ backgroundColor: accent }}
        />

        <div className="flex items-start gap-4 p-4 pl-5">
          {/* Initials badge */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
            style={{
              backgroundColor: `${accent}18`,
              color: accent,
              border: `1px solid ${accent}30`,
            }}
          >
            {getInitials(page.title) || <BookOpen className="h-4 w-4" />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold leading-snug group-hover:text-amber-500 transition-colors truncate">
                  {page.title}
                </h3>
                {page.summary && (
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground/70 line-clamp-2">
                    {page.summary}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/20 mt-0.5 group-hover:text-amber-500/60 group-hover:translate-x-0.5 transition-all" />
            </div>

            {/* Tags row */}
            {page.tags && page.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {page.project && (
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `${accent}15`,
                      color: accent,
                      border: `1px solid ${accent}25`,
                    }}
                  >
                    {page.project}
                  </span>
                )}
                {page.tags.slice(0, 2).map(tag => (
                  <span
                    key={tag}
                    className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground/60"
                  >
                    #{tag}
                  </span>
                ))}
                {/* Show more tags on larger screens */}
                {page.tags.slice(2, 4).map(tag => (
                  <span
                    key={tag}
                    className="hidden sm:inline-block rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground/60"
                  >
                    #{tag}
                  </span>
                ))}
                {page.tags.length > 4 && (
                  <span className="hidden sm:inline-block rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground/40">
                    +{page.tags.length - 4}
                  </span>
                )}
                {page.tags.length > 2 && (
                  <span className="sm:hidden rounded-md bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground/40">
                    +{page.tags.length - 2}
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground/50">
              <span className="flex items-center gap-1">
                <ThumbsUp className="h-3 w-3" />
                {page.voteCount}
              </span>
              <span className="hidden sm:flex items-center gap-1">
                <GitBranch className="h-3 w-3" />v{page.version} · {page.editCount} edits
              </span>
              {'relevance' in page && page.relevance != null && (
                <span className="flex items-center gap-1 text-amber-500/70">
                  <Sparkles className="h-3 w-3" />
                  {Math.round(page.relevance * 100)}%
                </span>
              )}
              <span className="flex items-center gap-1 ml-auto">
                <Clock className="h-3 w-3" />
                {new Date(page.updatedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
