import { createFileRoute } from '@tanstack/react-router';
import {
  Activity,
  Loader2,
  Sparkles,
  BookOpen,
  FilePlus,
  FileEdit,
  Link2,
  Zap,
  Bot,
} from 'lucide-react';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiLog } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/log')({
  component: WikiLogPage,
});

const OPERATION_META: Record<string, { label: string; icon: typeof Activity; color: string }> = {
  ingest: { label: 'Source ingested', icon: FilePlus, color: 'text-blue-500' },
  page_created: { label: 'Page created', icon: BookOpen, color: 'text-emerald-500' },
  page_updated: { label: 'Page updated', icon: FileEdit, color: 'text-amber-500' },
  page_linked: { label: 'Pages linked', icon: Link2, color: 'text-violet-500' },
  lint_pass: { label: 'Lint run', icon: Zap, color: 'text-orange-500' },
  contradiction: { label: 'Contradiction flagged', icon: Activity, color: 'text-destructive' },
};

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function WikiLogPage() {
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;

  const { data, isLoading } = useWikiLog(orgId, { limit: 100 });
  const entries = data?.results ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Activity Log</h2>
          <p className="text-sm text-muted-foreground">
            Every wiki operation in chronological order
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {entries.length} event{entries.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">No activity yet</p>
        </div>
      )}

      {!isLoading && entries.length > 0 && (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />

          <div className="space-y-1">
            {entries.map(entry => {
              const meta = OPERATION_META[entry.operation] ?? {
                label: entry.operation,
                icon: Activity,
                color: 'text-muted-foreground',
              };
              const Icon = meta.icon;

              return (
                <div key={entry.id} className="flex gap-4 pl-1">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 rounded-xl border bg-card/50 p-3.5 backdrop-blur mb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {meta.label}
                          </span>
                          {entry.agentId && (
                            <span className="flex items-center gap-1 text-[10px] rounded-md bg-muted/60 px-1.5 py-0.5 text-muted-foreground">
                              <Bot className="h-3 w-3" />
                              agent
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm">{entry.summary}</p>
                        {entry.relatedPageIds?.length || entry.relatedSourceIds?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {entry.relatedPageIds?.map(id => (
                              <span
                                key={id}
                                className="rounded-md bg-primary/5 border border-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary/70"
                              >
                                page
                              </span>
                            ))}
                            {entry.relatedSourceIds?.map(id => (
                              <span
                                key={id}
                                className="rounded-md bg-blue-500/5 border border-blue-500/10 px-1.5 py-0.5 text-[10px] font-mono text-blue-600/70"
                              >
                                source
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelative(entry.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
