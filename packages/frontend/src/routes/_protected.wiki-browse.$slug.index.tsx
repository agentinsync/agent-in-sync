import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  GitBranch,
  Clock,
  FileText,
  History,
  Edit,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  User,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  MessageSquare,
  ScrollText,
  Layers,
  Newspaper,
  BookMarked,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiPage, useWikiGraph, useVoteWikiPage, useWikiSource } from '@/lib/api/wiki';
import type { WikiPageSource } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/$slug/')({
  component: WikiPageView,
});

// === Source sidebar helpers ===

const SOURCE_ICON: Record<string, React.ElementType> = {
  documentation: BookOpen,
  architecture: Layers,
  meeting_notes: ScrollText,
  slack_thread: MessageSquare,
  article: Newspaper,
  runbook: BookMarked,
  other: HelpCircle,
};

const SOURCE_COLOR: Record<string, string> = {
  documentation: '#3b82f6',
  architecture: '#8b5cf6',
  meeting_notes: '#10b981',
  slack_thread: '#ec4899',
  article: '#f59e0b',
  runbook: '#f97316',
  other: '#6b7280',
};

function sourceIcon(type: string): React.ElementType {
  return SOURCE_ICON[type] ?? HelpCircle;
}

function sourceColor(type: string): string {
  return SOURCE_COLOR[type] ?? '#6b7280';
}

function SidebarSourceItem({
  source,
  orgId,
  isExpanded,
  onToggle,
}: {
  source: WikiPageSource;
  orgId: string | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = sourceIcon(source.sourceType);
  const color = sourceColor(source.sourceType);
  const { data, isLoading } = useWikiSource(isExpanded ? source.id : null, orgId);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!data?.content) return;
    navigator.clipboard.writeText(data.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden transition-all">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
        <span className="flex-1 min-w-0 text-xs font-medium truncate">{source.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          {source.sourceUrl && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="Open original"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border/30">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
            </div>
          ) : data ? (
            <>
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-muted/20">
                <span className="text-[10px] text-muted-foreground/40 font-mono">
                  {data.content.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/50
                    hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div
                className="max-h-48 overflow-y-auto px-2.5 py-2 font-mono text-[10px] leading-relaxed
                  text-foreground/60 whitespace-pre-wrap break-words"
              >
                {data.content}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function WikiPageView() {
  const { slug } = Route.useParams();
  const { selectedOrg, isLoading: isOrgLoading } = useOrganization();
  const orgId = selectedOrg?.id;

  const { data: page, isLoading, isError } = useWikiPage(slug, orgId);
  const { data: graph } = useWikiGraph(orgId);
  const vote = useVoteWikiPage(orgId);
  const [localVote, setLocalVote] = useState<'up' | 'down' | null>(null);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

  const relatedPages = (() => {
    if (!graph || !page) return [];
    const node = graph.nodes.find(n => n.slug === slug);
    if (!node) return [];
    const targetIds = new Set(graph.edges.filter(e => e.sourceId === node.id).map(e => e.targetId));
    return graph.nodes.filter(n => targetIds.has(n.id));
  })();

  if (isOrgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !page) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The wiki page{' '}
          <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{slug}</code> does not
          exist yet.
        </p>
        <a href="/wiki-browse">
          <Button variant="outline" size="sm" className="mt-6 gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Wiki
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <a
            href="/wiki-browse"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Wiki
          </a>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{page.title}</span>
        </nav>

        {/* Page header */}
        <div className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{page.title}</h1>
              {page.summary && <p className="mt-2 text-muted-foreground">{page.summary}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              {page.version > 1 && (
                <a href={`/wiki-browse/${page.slug}/history`}>
                  <Button size="sm" variant="outline" className="gap-2">
                    <History className="h-4 w-4" />
                    History
                  </Button>
                </a>
              )}
              <a href={`/wiki-browse/${page.slug}/edit`}>
                <Button size="sm" className="gap-2 bg-amber-500 text-black hover:bg-amber-400">
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </a>
            </div>
          </div>

          {/* Meta */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              Version {page.version}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5 text-amber-500" />
              {page.voteCount} votes
            </span>
            <span className="flex items-center gap-1">
              <History className="h-3.5 w-3.5" />
              {page.editCount} edits
            </span>
            <span className="flex items-center gap-1 flex-wrap">
              <Clock className="h-3.5 w-3.5" />
              Updated {new Date(page.updatedAt).toLocaleDateString()}
              {page.lastEditedByAgentSlug && (
                <>
                  {' by '}
                  <a
                    href={`/agents/${page.lastEditedByAgentSlug}`}
                    className="text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    {page.lastEditedByAgentName ?? page.lastEditedByAgentSlug}
                  </a>
                </>
              )}
            </span>
          </div>

          {/* Tags */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {page.project && (
              <span className="rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary">
                {page.project}
              </span>
            )}
            {page.tags?.map(tag => (
              <span
                key={tag}
                className="rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Vote controls */}
        <div className="mb-6 flex items-center gap-3 rounded-xl border bg-card/50 p-4 backdrop-blur">
          <span className="text-sm text-muted-foreground">Was this page helpful?</span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              disabled={vote.isPending}
              onClick={() => {
                const dir = 'up';
                setLocalVote(localVote === dir ? null : dir);
                vote.mutate({ slug, direction: dir });
              }}
              className={`gap-2 transition-colors ${localVote === 'up' ? 'border-emerald-500/60 text-emerald-600 bg-emerald-500/10' : 'hover:border-emerald-500/40 hover:text-emerald-600'}`}
            >
              <ThumbsUp className="h-4 w-4" />
              <span className="font-semibold tabular-nums">{page.voteCount}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={vote.isPending}
              onClick={() => {
                const dir = 'down';
                setLocalVote(localVote === dir ? null : dir);
                vote.mutate({ slug, direction: dir });
              }}
              className={`gap-1.5 transition-colors ${localVote === 'down' ? 'border-destructive/60 text-destructive bg-destructive/10' : 'hover:border-destructive/40 hover:text-destructive'}`}
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="rounded-xl border bg-card/50 p-6 backdrop-blur">
          <MarkdownRenderer content={page.body} />
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-full space-y-4 lg:w-72 lg:shrink-0">
        {/* Page info */}
        <div className="rounded-xl border bg-card/50 p-5 backdrop-blur text-xs text-muted-foreground space-y-2">
          <div className="flex justify-between gap-2">
            <span className="flex items-center gap-1.5 shrink-0">
              <User className="h-3.5 w-3.5" />
              Created by
            </span>
            {page.createdByAgentSlug ? (
              <a
                href={`/agents/${page.createdByAgentSlug}`}
                className="text-amber-500 hover:text-amber-400 transition-colors truncate text-right"
              >
                {page.createdByAgentName ?? page.createdByAgentSlug}
              </a>
            ) : (
              <span className="truncate text-right">{page.createdByUserName ?? 'Unknown'}</span>
            )}
          </div>
          {page.lastEditedByAgentSlug && (
            <div className="flex justify-between gap-2">
              <span className="flex items-center gap-1.5 shrink-0">
                <Edit className="h-3.5 w-3.5" />
                Last edited by
              </span>
              <a
                href={`/agents/${page.lastEditedByAgentSlug}`}
                className="text-amber-500 hover:text-amber-400 transition-colors truncate text-right"
              >
                {page.lastEditedByAgentName ?? page.lastEditedByAgentSlug}
              </a>
            </div>
          )}
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Created
            </span>
            <span>{new Date(page.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Last updated
            </span>
            <span>{new Date(page.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Current version
            </span>
            <span>v{page.version}</span>
          </div>
        </div>

        {/* Related pages */}
        {relatedPages.length > 0 && (
          <div className="rounded-xl border bg-card/50 p-5 backdrop-blur">
            <div className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Related Pages
            </div>
            <div className="space-y-1">
              {relatedPages.map(related => (
                <a
                  key={related.id}
                  href={`/wiki-browse/${related.slug}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm
                    hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400
                    transition-colors group"
                >
                  <span className="truncate">{related.title}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 group-hover:text-amber-500/60 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {page.sources.length > 0 && (
          <div className="rounded-xl border bg-card/50 p-5 backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Sources
              </span>
              <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                {page.sources.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {page.sources.slice(0, 5).map(source => (
                <SidebarSourceItem
                  key={source.id}
                  source={source}
                  orgId={orgId}
                  isExpanded={expandedSourceId === source.id}
                  onToggle={() =>
                    setExpandedSourceId(prev => (prev === source.id ? null : source.id))
                  }
                />
              ))}
            </div>
            {page.sources.length > 5 && (
              <a
                href="/wiki-browse/sources"
                className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground/50
                  hover:text-amber-500 transition-colors pt-2 border-t border-border/30"
              >
                <ChevronRight className="h-3 w-3" />
                View all {page.sources.length} sources
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
