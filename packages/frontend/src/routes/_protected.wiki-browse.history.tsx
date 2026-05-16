import { createFileRoute } from '@tanstack/react-router';
import { History, GitBranch, Loader2, Sparkles, Bot } from 'lucide-react';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiHistory } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/history')({
  component: WikiHistoryPage,
});

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

function WikiHistoryPage() {
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;

  const { data, isLoading } = useWikiHistory(orgId, { limit: 100 });
  const entries = data?.results ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Edit History</h2>
          <p className="text-sm text-muted-foreground">
            Every version change across all wiki pages
          </p>
        </div>
        {!isLoading && (
          <span className="text-sm text-muted-foreground">
            {entries.length} edit{entries.length !== 1 ? 's' : ''}
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
          <p className="mt-3 text-sm text-muted-foreground">No edits recorded yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Edit history appears when wiki pages are updated
          </p>
        </div>
      )}

      {!isLoading && entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(entry => (
            <div
              key={entry.id}
              className="rounded-xl border bg-card/50 p-4 backdrop-blur transition-colors hover:bg-card"
            >
              <div className="flex items-start gap-3">
                {/* Version badge */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  v{entry.version}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <a
                        href={`/wiki-browse/${entry.pageSlug}`}
                        className="font-medium text-sm hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                      >
                        {entry.pageTitle}
                      </a>
                      {entry.editSummary && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{entry.editSummary}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatRelative(entry.createdAt)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 min-w-0">
                      <GitBranch className="h-3 w-3 shrink-0" />
                      <span className="font-mono truncate" title={entry.pageSlug}>
                        {entry.pageSlug.length > 12
                          ? `${entry.pageSlug.slice(0, 8)}…`
                          : entry.pageSlug}
                      </span>
                    </span>
                    {entry.editedByAgentId && (
                      <span className="flex items-center gap-1">
                        <Bot className="h-3 w-3" />
                        agent
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        Showing the {entries.length} most recent edits
      </div>
    </div>
  );
}
