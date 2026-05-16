import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  GitCommitHorizontal,
  Clock,
  Minus,
  Plus,
  AlignLeft,
  Columns2,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiPageVersions } from '@/lib/api/wiki';

export const Route = createFileRoute('/_protected/wiki-browse/$slug/history')({
  component: WikiVersionHistory,
});

// ── Metadata diff helpers ────────────────────────────────────────────

function TextFieldDiff({
  label,
  oldVal,
  newVal,
}: {
  label: string;
  oldVal: string | null;
  newVal: string | null;
}) {
  const changed = oldVal !== newVal;
  if (!changed) return null;
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 items-start py-2 border-b border-border/30 last:border-0 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 pt-0.5 w-16 shrink-0">
        {label}
      </span>
      <div className="min-w-0 rounded border-l-2 border-red-500 bg-red-500/[0.06] px-2 py-1 font-mono text-red-400 break-words">
        {oldVal ? (
          <>
            <span className="text-red-500/50 mr-1">−</span>
            {oldVal}
          </>
        ) : (
          <span className="italic text-red-400/40">empty</span>
        )}
      </div>
      <div className="min-w-0 rounded border-l-2 border-emerald-500 bg-emerald-500/[0.06] px-2 py-1 font-mono text-emerald-400 break-words">
        {newVal ? (
          <>
            <span className="text-emerald-500/50 mr-1">+</span>
            {newVal}
          </>
        ) : (
          <span className="italic text-emerald-400/40">empty</span>
        )}
      </div>
    </div>
  );
}

function TagsDiff({ oldTags, newTags }: { oldTags: string[] | null; newTags: string[] | null }) {
  const oldSet = new Set(oldTags ?? []);
  const newSet = new Set(newTags ?? []);
  const removed = [...oldSet].filter(t => !newSet.has(t));
  const added = [...newSet].filter(t => !oldSet.has(t));
  if (removed.length === 0 && added.length === 0) return null;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 items-start py-2 border-b border-border/30 last:border-0 text-xs">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 pt-0.5 w-16 shrink-0">
        tags
      </span>
      <div className="flex flex-wrap gap-1">
        {removed.map(t => (
          <span
            key={t}
            className="rounded bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 text-[10px] font-mono text-red-400 line-through"
          >
            {t}
          </span>
        ))}
        {added.map(t => (
          <span
            key={t}
            className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400"
          >
            +{t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Diff algorithm ──────────────────────────────────────────────────

type RawLine =
  | { type: 'same'; content: string; oldLine: number; newLine: number }
  | { type: 'removed'; content: string; oldLine: number }
  | { type: 'added'; content: string; newLine: number };

function computeLineDiff(oldText: string, newText: string): RawLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // LCS DP — O(m·n), fine for typical wiki sizes
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1]![j - 1]! + 1
          : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }

  const result: RawLine[] = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: 'same', content: oldLines[i - 1]!, oldLine: i, newLine: j });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ type: 'added', content: newLines[j - 1]!, newLine: j });
      j--;
    } else {
      result.unshift({ type: 'removed', content: oldLines[i - 1]!, oldLine: i });
      i--;
    }
  }
  return result;
}

type SideBySideRow =
  | { type: 'same'; left: string; right: string; leftLine: number; rightLine: number }
  | {
      type: 'change';
      left: string | null;
      right: string | null;
      leftLine: number | null;
      rightLine: number | null;
    };

function toSideBySide(diff: RawLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;
  while (i < diff.length) {
    const line = diff[i]!;
    if (line.type === 'same') {
      rows.push({
        type: 'same',
        left: line.content,
        right: line.content,
        leftLine: line.oldLine,
        rightLine: line.newLine,
      });
      i++;
    } else {
      const removes: Extract<RawLine, { type: 'removed' }>[] = [];
      const adds: Extract<RawLine, { type: 'added' }>[] = [];
      while (i < diff.length && diff[i]!.type !== 'same') {
        const l = diff[i]!;
        if (l.type === 'removed') removes.push(l);
        else if (l.type === 'added') adds.push(l);
        i++;
      }
      const maxLen = Math.max(removes.length, adds.length);
      for (let k = 0; k < maxLen; k++) {
        rows.push({
          type: 'change',
          left: removes[k]?.content ?? null,
          right: adds[k]?.content ?? null,
          leftLine: removes[k]?.oldLine ?? null,
          rightLine: adds[k]?.newLine ?? null,
        });
      }
    }
  }
  return rows;
}

// ── Stats ────────────────────────────────────────────────────────────

function diffStats(diff: RawLine[]) {
  return diff.reduce(
    (acc, l) => {
      if (l.type === 'added') acc.added++;
      else if (l.type === 'removed') acc.removed++;
      return acc;
    },
    { added: 0, removed: 0 }
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function LineNum({ n }: { n: number | null }) {
  return (
    <span className="w-10 shrink-0 select-none text-right pr-3 font-mono text-[10px] text-amber-500/25">
      {n ?? ''}
    </span>
  );
}

function SideBySideDiff({ rows }: { rows: SideBySideRow[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-border/40 font-mono text-xs leading-5 overflow-x-auto">
      {/* Left column */}
      <div>
        {rows.map((row, idx) => (
          <div
            key={`l-${idx}`}
            className={`flex min-w-0 border-l-2 ${
              row.type === 'change' && row.left != null
                ? 'border-red-500 bg-red-500/[0.06]'
                : 'border-transparent'
            }`}
          >
            <LineNum n={row.leftLine} />
            {row.type === 'change' && row.left != null ? (
              <span className="flex-1 px-2 text-red-400 whitespace-pre overflow-hidden">
                <span className="text-red-500/50 mr-1">−</span>
                {row.left}
              </span>
            ) : row.type === 'change' ? (
              <span className="flex-1 px-2 text-transparent select-none">·</span>
            ) : (
              <span className="flex-1 px-2 text-foreground/70 whitespace-pre overflow-hidden">
                {row.left}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Right column */}
      <div>
        {rows.map((row, idx) => (
          <div
            key={`r-${idx}`}
            className={`flex min-w-0 border-l-2 ${
              row.type === 'change' && row.right != null
                ? 'border-emerald-500 bg-emerald-500/[0.06]'
                : 'border-transparent'
            }`}
          >
            <LineNum n={row.rightLine} />
            {row.type === 'change' && row.right != null ? (
              <span className="flex-1 px-2 text-emerald-400 whitespace-pre overflow-hidden">
                <span className="text-emerald-500/50 mr-1">+</span>
                {row.right}
              </span>
            ) : row.type === 'change' ? (
              <span className="flex-1 px-2 text-transparent select-none">·</span>
            ) : (
              <span className="flex-1 px-2 text-foreground/70 whitespace-pre overflow-hidden">
                {row.right}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UnifiedDiff({ diff }: { diff: RawLine[] }) {
  return (
    <div className="font-mono text-xs leading-5 overflow-x-auto">
      {diff.map((line, idx) => {
        if (line.type === 'same') {
          return (
            <div key={idx} className="flex border-l-2 border-transparent">
              <LineNum n={line.oldLine} />
              <span className="flex-1 px-2 text-foreground/70 whitespace-pre overflow-hidden">
                {line.content}
              </span>
            </div>
          );
        }
        if (line.type === 'removed') {
          return (
            <div key={idx} className="flex border-l-2 border-red-500 bg-red-500/[0.06]">
              <LineNum n={line.oldLine} />
              <span className="flex-1 px-2 text-red-400 whitespace-pre overflow-hidden">
                <span className="text-red-500/50 mr-1">−</span>
                {line.content}
              </span>
            </div>
          );
        }
        return (
          <div key={idx} className="flex border-l-2 border-emerald-500 bg-emerald-500/[0.06]">
            <LineNum n={line.newLine} />
            <span className="flex-1 px-2 text-emerald-400 whitespace-pre overflow-hidden">
              <span className="text-emerald-500/50 mr-1">+</span>
              {line.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

function WikiVersionHistory() {
  const { slug } = Route.useParams();
  const { selectedOrg } = useOrganization();
  const orgId = selectedOrg?.id;

  const { data, isLoading } = useWikiPageVersions(slug, orgId);
  // Two independent anchors: base (old) and compare (new).
  // The user picks them in any order; we normalize low→high for the diff.
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [diffMode, setDiffMode] = useState<'side-by-side' | 'unified'>('unified');

  // All versions in descending order (current first)
  const allVersions = useMemo(() => {
    if (!data) return [];
    return [
      {
        version: data.current.version,
        title: data.current.title,
        summary: data.current.summary,
        body: data.current.body,
        tags: data.current.tags,
        editSummary: null,
        createdAt: data.current.updatedAt,
        isCurrent: true,
      },
      ...data.history.map(h => ({ ...h, isCurrent: false })),
    ];
  }, [data]);

  function handleVersionClick(version: number) {
    if (baseVersion === null) {
      // Nothing selected yet — set base
      setBaseVersion(version);
    } else if (compareVersion === null) {
      if (version === baseVersion) {
        // Clicked the same one — deselect
        setBaseVersion(null);
      } else {
        // Pick the compare target
        setCompareVersion(version);
      }
    } else {
      // Both already set
      if (version === baseVersion) {
        // Promote compare to base, clear compare
        setBaseVersion(compareVersion);
        setCompareVersion(null);
      } else if (version === compareVersion) {
        // Deselect compare
        setCompareVersion(null);
      } else {
        // Replace compare with new selection
        setCompareVersion(version);
      }
    }
  }

  // Normalize: lower version number is always the "old" side
  const compareEntry = useMemo(() => {
    if (baseVersion === null || compareVersion === null) return null;

    const [low, high] =
      baseVersion < compareVersion ? [baseVersion, compareVersion] : [compareVersion, baseVersion];

    const getSnap = (v: number) => allVersions.find(av => av.version === v);
    const oldSnap = getSnap(low);
    const newSnap = getSnap(high);
    if (!oldSnap || !newSnap) return null;

    return {
      oldVersion: low,
      newVersion: high,
      oldTitle: oldSnap.title,
      newTitle: newSnap.title,
      oldSummary: oldSnap.summary,
      newSummary: newSnap.summary,
      oldTags: oldSnap.tags,
      newTags: newSnap.tags,
      oldBody: oldSnap.body,
      newBody: newSnap.body,
    };
  }, [baseVersion, compareVersion, allVersions]);

  const diff = useMemo(() => {
    if (!compareEntry) return null;
    return computeLineDiff(compareEntry.oldBody, compareEntry.newBody);
  }, [compareEntry]);

  const sideBySideRows = useMemo(() => (diff ? toSideBySide(diff) : null), [diff]);
  const stats = useMemo(() => (diff ? diffStats(diff) : null), [diff]);

  const noHistory = data && data.history.length === 0;

  // Instruction hint shown in diff panel when not enough versions selected
  const hint =
    baseVersion === null
      ? { heading: 'Select a base version', sub: 'Click any version on the left to start' }
      : { heading: 'Select a version to compare', sub: 'Click another version to see the diff' };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <a
          href={`/wiki-browse/${slug}`}
          className="flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {data?.current.title ?? 'Page'}
        </a>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground">Version History</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {noHistory && (
        <div className="flex flex-col items-center rounded-xl border border-dashed py-20 text-center">
          <FileText className="h-8 w-8 text-muted-foreground/20 mb-3" />
          <p className="font-medium text-sm">Only one version exists</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Edit the page to start building history
          </p>
        </div>
      )}

      {data && data.history.length > 0 && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          {/* ── Version timeline ──────────────────────── */}
          <div className="w-full lg:w-60 shrink-0">
            <div className="rounded-xl border bg-card/50 backdrop-blur overflow-hidden">
              <div className="border-b border-border/50 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Versions
                </span>
                {(baseVersion !== null || compareVersion !== null) && (
                  <button
                    onClick={() => {
                      setBaseVersion(null);
                      setCompareVersion(null);
                    }}
                    className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Selection guide */}
              <div className="border-b border-border/30 px-3 py-2 bg-muted/20 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <span
                  className={`flex items-center gap-1 ${baseVersion !== null ? 'text-amber-500' : ''}`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full border-2 ${baseVersion !== null ? 'bg-amber-500 border-amber-500' : 'border-muted-foreground/30'}`}
                  />
                  {baseVersion !== null ? `v${baseVersion}` : 'base'}
                </span>
                <span className="text-muted-foreground/30">→</span>
                <span
                  className={`flex items-center gap-1 ${compareVersion !== null ? 'text-blue-400' : ''}`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full border-2 ${compareVersion !== null ? 'bg-blue-400 border-blue-400' : 'border-muted-foreground/30'}`}
                  />
                  {compareVersion !== null ? `v${compareVersion}` : 'compare'}
                </span>
              </div>

              <div className="p-2 space-y-0.5">
                {allVersions.map(v => {
                  const isBase = baseVersion === v.version;
                  const isCompare = compareVersion === v.version;
                  const isCurrent = v.isCurrent;
                  return (
                    <button
                      key={v.version}
                      onClick={() => handleVersionClick(v.version)}
                      className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                        isBase
                          ? 'bg-amber-500/15 text-foreground ring-1 ring-amber-500/30'
                          : isCompare
                            ? 'bg-blue-500/10 text-foreground ring-1 ring-blue-400/30'
                            : 'hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isBase ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500/30" />
                        ) : isCompare ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-400 ring-2 ring-blue-400/30" />
                        ) : isCurrent ? (
                          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/40 ring-2 ring-amber-500/20" />
                        ) : (
                          <div className="h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/30" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-xs font-mono font-bold ${isBase ? 'text-amber-500' : isCompare ? 'text-blue-400' : isCurrent ? 'text-amber-500/70' : ''}`}
                          >
                            v{v.version}
                          </span>
                          {isCurrent && (
                            <span className="rounded-sm bg-amber-500/20 px-1 py-0 text-[9px] font-semibold text-amber-500 uppercase tracking-wide">
                              current
                            </span>
                          )}
                          {isBase && (
                            <span className="rounded-sm bg-amber-500/20 px-1 py-0 text-[9px] font-semibold text-amber-500 uppercase tracking-wide">
                              base
                            </span>
                          )}
                          {isCompare && (
                            <span className="rounded-sm bg-blue-400/20 px-1 py-0 text-[9px] font-semibold text-blue-400 uppercase tracking-wide">
                              compare
                            </span>
                          )}
                        </div>
                        {v.editSummary && (
                          <p className="mt-0.5 text-[10px] leading-tight truncate opacity-60">
                            {v.editSummary}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] opacity-40 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5 shrink-0" />
                          {new Date(v.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit',
                          })}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Diff panel ───────────────────────────── */}
          <div className="flex-1 min-w-0">
            {!compareEntry ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
                <GitCommitHorizontal className="h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium">{hint.heading}</p>
                <p className="mt-1 text-xs text-muted-foreground">{hint.sub}</p>
              </div>
            ) : diff && stats && sideBySideRows ? (
              <div className="rounded-xl border bg-card/50 backdrop-blur overflow-hidden">
                {/* Diff header */}
                <div className="flex items-center justify-between gap-4 border-b border-border/50 px-4 py-2.5">
                  <div className="flex items-center gap-2 font-mono text-sm">
                    <span className="text-amber-500/80">v{compareEntry.oldVersion}</span>
                    <span className="text-muted-foreground/30">→</span>
                    <span className="text-blue-400/80">v{compareEntry.newVersion}</span>
                    {compareEntry.newVersion === data.current.version && (
                      <span className="rounded-sm bg-amber-500/20 px-1.5 py-0 text-[9px] font-semibold text-amber-500 uppercase tracking-wide">
                        current
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Stats badges */}
                    <div className="flex items-center gap-2 text-xs font-mono">
                      {stats.added > 0 && (
                        <span className="flex items-center gap-0.5 text-emerald-500">
                          <Plus className="h-3 w-3" />
                          {stats.added}
                        </span>
                      )}
                      {stats.removed > 0 && (
                        <span className="flex items-center gap-0.5 text-red-400">
                          <Minus className="h-3 w-3" />
                          {stats.removed}
                        </span>
                      )}
                    </div>

                    {/* View toggle — hidden on mobile (unified is forced) */}
                    <div className="hidden sm:flex rounded-lg border border-border/50 overflow-hidden">
                      {(
                        [
                          { mode: 'side-by-side' as const, icon: Columns2, label: 'Split' },
                          { mode: 'unified' as const, icon: AlignLeft, label: 'Unified' },
                        ] as const
                      ).map(({ mode, icon: Icon, label }) => (
                        <button
                          key={mode}
                          onClick={() => setDiffMode(mode)}
                          title={label}
                          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors ${
                            diffMode === mode
                              ? 'bg-amber-500/15 text-amber-500'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Metadata diff (title / summary / tags) */}
                {(compareEntry.oldTitle !== compareEntry.newTitle ||
                  compareEntry.oldSummary !== compareEntry.newSummary ||
                  JSON.stringify(compareEntry.oldTags) !==
                    JSON.stringify(compareEntry.newTags)) && (
                  <div className="border-b border-border/50 px-4 py-3 bg-muted/10 space-y-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 mb-2 font-semibold">
                      Metadata changes
                    </p>
                    <TextFieldDiff
                      label="title"
                      oldVal={compareEntry.oldTitle}
                      newVal={compareEntry.newTitle}
                    />
                    <TextFieldDiff
                      label="summary"
                      oldVal={compareEntry.oldSummary}
                      newVal={compareEntry.newSummary}
                    />
                    <TagsDiff oldTags={compareEntry.oldTags} newTags={compareEntry.newTags} />
                  </div>
                )}

                {/* No body changes case */}
                {stats.added === 0 && stats.removed === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No body changes between these versions
                    </p>
                  </div>
                ) : diffMode === 'side-by-side' ? (
                  <>
                    {/* Column headers */}
                    <div className="grid grid-cols-2 divide-x divide-border/40 border-b border-border/40 bg-muted/20">
                      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500/50">
                        v{compareEntry.oldVersion} — base
                      </div>
                      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-blue-400/50">
                        v{compareEntry.newVersion} — compare
                      </div>
                    </div>
                    <SideBySideDiff rows={sideBySideRows} />
                  </>
                ) : (
                  <UnifiedDiff diff={diff} />
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
