import { createFileRoute } from '@tanstack/react-router';
import {
  ExternalLink,
  Loader2,
  Sparkles,
  Tag,
  FolderOpen,
  ChevronDown,
  ChevronUp,
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
import { useState } from 'react';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiSources, useWikiSource } from '@/lib/api/wiki';
import type { WikiSource } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/sources')({
  component: WikiSourcesPage,
});

const SOURCE_TYPE_META: Record<
  string,
  { color: string; bg: string; border: string; icon: React.ElementType; label: string }
> = {
  documentation: {
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
    icon: BookOpen,
    label: 'Documentation',
  },
  architecture: {
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,0.08)',
    border: 'rgba(139,92,246,0.25)',
    icon: Layers,
    label: 'Architecture',
  },
  meeting_notes: {
    color: '#10b981',
    bg: 'rgba(16,185,129,0.08)',
    border: 'rgba(16,185,129,0.25)',
    icon: ScrollText,
    label: 'Meeting Notes',
  },
  slack_thread: {
    color: '#ec4899',
    bg: 'rgba(236,72,153,0.08)',
    border: 'rgba(236,72,153,0.25)',
    icon: MessageSquare,
    label: 'Slack Thread',
  },
  article: {
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.25)',
    icon: Newspaper,
    label: 'Article',
  },
  runbook: {
    color: '#f97316',
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.25)',
    icon: BookMarked,
    label: 'Runbook',
  },
  other: {
    color: '#6b7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.25)',
    icon: HelpCircle,
    label: 'Other',
  },
};

function getTypeMeta(sourceType: string) {
  return SOURCE_TYPE_META[sourceType] ?? SOURCE_TYPE_META.other!;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function SourceContentPanel({ sourceId, orgId }: { sourceId: string; orgId: string | undefined }) {
  const { data, isLoading } = useWikiSource(sourceId, orgId);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!data?.content) return;
    navigator.clipboard.writeText(data.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
        <span className="ml-2 text-xs text-muted-foreground/50">Loading content…</span>
      </div>
    );
  }

  if (!data) return null;

  const words = wordCount(data.content);
  const chars = data.content.length;

  return (
    <div className="border-t border-border/40">
      {/* Content toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/20">
        <span className="text-[10px] text-muted-foreground/50 font-mono">
          {words.toLocaleString()} words · {chars.toLocaleString()} chars
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-muted-foreground/60
            hover:text-foreground hover:bg-muted/60 transition-all"
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
      {/* Content body */}
      <div
        className="max-h-96 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed
          text-foreground/70 whitespace-pre-wrap break-words scrollbar-thin
          scrollbar-thumb-border/60 scrollbar-track-transparent"
      >
        {data.content}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  orgId,
  isExpanded,
  onToggle,
}: {
  source: WikiSource;
  orgId: string | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const meta = getTypeMeta(source.sourceType);
  const TypeIcon = meta.icon;

  return (
    <div
      className="rounded-xl border bg-card/50 backdrop-blur overflow-hidden transition-all duration-200"
      style={{ borderColor: isExpanded ? meta.border : 'hsl(var(--border))' }}
    >
      {/* Card header — always visible */}
      <button onClick={onToggle} className="w-full text-left" aria-expanded={isExpanded}>
        <div className="flex items-start gap-3 p-4 hover:bg-card/80 transition-colors">
          {/* Type icon badge */}
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5"
            style={{ backgroundColor: meta.bg, border: `1px solid ${meta.border}` }}
          >
            <TypeIcon className="h-4 w-4" style={{ color: meta.color }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-sm leading-snug line-clamp-1">
                  {source.title}
                </span>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/60">
                  {/* Type badge */}
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium border shrink-0"
                    style={{
                      color: meta.color,
                      backgroundColor: meta.bg,
                      borderColor: meta.border,
                    }}
                  >
                    {meta.label}
                  </span>

                  {source.project && (
                    <span className="flex items-center gap-1 shrink-0">
                      <FolderOpen className="h-3 w-3" />
                      {source.project}
                    </span>
                  )}

                  {source.tags && source.tags.length > 0 && (
                    <span className="flex items-center gap-1 min-w-0">
                      <Tag className="h-3 w-3 shrink-0" />
                      <span className="truncate">{source.tags.slice(0, 3).join(', ')}</span>
                    </span>
                  )}

                  <span className="ml-auto shrink-0">
                    {new Date(source.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Expand toggle */}
              <div className="shrink-0 flex items-center gap-2 mt-0.5">
                {source.sourceUrl && (
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs
                      text-muted-foreground/60 hover:text-foreground hover:bg-muted/60
                      border border-border/40 transition-all"
                    title="Open original source"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">Source</span>
                  </a>
                )}
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/40
                    text-muted-foreground/40 transition-all hover:text-foreground hover:border-border"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Expandable content panel */}
      {isExpanded && <SourceContentPanel sourceId={source.id} orgId={orgId} />}
    </div>
  );
}

function WikiSourcesPage() {
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;
  const [project, setProject] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useWikiSources(orgId, { limit: 50, project });
  const sources = data?.results ?? [];
  const projects = [...new Set(sources.map(s => s.project).filter(Boolean))] as string[];

  function handleToggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Raw Sources</h2>
          <p className="text-sm text-muted-foreground">
            Knowledge ingested from documentation, threads, and architecture docs
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {sources.length} source{sources.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Project filter */}
      {projects.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setProject(undefined);
              setExpandedId(null);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              project == null
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            All
          </button>
          {projects.map(p => (
            <button
              key={p}
              onClick={() => {
                setProject(p);
                setExpandedId(null);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                project === p
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && sources.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">No sources ingested yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Use the MCP{' '}
            <code className="font-mono rounded bg-muted px-1 py-0.5">ingest_source</code> tool to
            add knowledge
          </p>
        </div>
      )}

      {/* Source list */}
      {!isLoading && sources.length > 0 && (
        <div className="space-y-2">
          {sources.map(source => (
            <SourceCard
              key={source.id}
              source={source}
              orgId={orgId}
              isExpanded={expandedId === source.id}
              onToggle={() => handleToggle(source.id)}
            />
          ))}
        </div>
      )}

      {/* Type legend */}
      {!isLoading && sources.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-2 border-t border-border/30">
          {Object.entries(SOURCE_TYPE_META).map(([key, meta]) => {
            const Icon = meta.icon;
            const count = sources.filter(s => s.sourceType === key).length;
            if (count === 0) return null;
            return (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                <Icon className="h-3 w-3" style={{ color: meta.color }} />
                {meta.label} ({count})
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
