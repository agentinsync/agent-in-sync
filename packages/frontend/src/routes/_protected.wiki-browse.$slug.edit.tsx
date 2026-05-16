import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Eye, PenLine, Check, Loader2, Copy, Tag, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useOrganization } from '@/hooks/use-organization';
import { useWikiPage, useUpsertWikiPage, WikiPage } from '@/lib/api/wiki';
import { ApiError } from '@/lib/api/client';
import type { NavigateFn } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/wiki-browse/$slug/edit')({
  component: EditWikiPagePage,
});

// ─── Sub-components ────────────────────────────────────────────────────────

function ArcRing({ value, min, max }: { value: number; min: number; max: number }) {
  const r = 10;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(value, max));
  const pct = clamped / max;
  const dash = pct * circumference;
  const atMin = value >= min;
  const nearMax = value > max * 0.9;
  const overMax = value > max;
  const stroke = overMax ? '#ef4444' : nearMax ? '#f97316' : atMin ? '#f59e0b' : '#374151';

  return (
    <svg width="26" height="26" viewBox="0 0 26 26" className="shrink-0 -rotate-90">
      <circle
        cx="13"
        cy="13"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        className="text-muted/30"
      />
      <circle
        cx="13"
        cy="13"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.2s ease, stroke 0.3s ease' }}
      />
    </svg>
  );
}

function SlugBar({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(`/wiki-browse/${value}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Page ID
        </label>
        <span className="text-xs text-muted-foreground/40">read-only</span>
      </div>
      <div className="flex items-center rounded-lg border border-input bg-muted/40 font-mono text-sm">
        <span className="select-none px-3 py-2 text-muted-foreground/40 border-r border-border/40 shrink-0">
          /wiki-browse/
        </span>
        <span className="flex-1 px-3 py-2 text-muted-foreground/60 truncate">{value}</span>
        <button
          type="button"
          onClick={copy}
          className="px-3 py-2 text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
          title="Copy URL"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function FieldWithCounter({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows,
  min,
  max,
  mono = false,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
  min: number;
  max: number;
  mono?: boolean;
  error?: string;
}) {
  const over = value.length > max;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={id}
            className="text-xs font-medium uppercase tracking-widest text-muted-foreground"
          >
            {label}
          </label>
          {hint && <span className="text-xs text-muted-foreground/50">· {hint}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            <span
              className={`text-xs tabular-nums ${over ? 'text-red-400' : 'text-muted-foreground/40'}`}
            >
              {value.length}/{max}
            </span>
          )}
          <ArcRing value={value.length} min={min} max={max} />
        </div>
      </div>
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className={`resize-none bg-background transition-all border-input focus-visible:border-amber-500/60 focus-visible:ring-2 focus-visible:ring-amber-500/15 ${mono ? 'font-mono text-sm' : ''} ${over || error ? 'border-red-500/50' : ''}`}
      />
    </div>
  );
}

function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tags = value
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Tags
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/15 transition-all">
        <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        <div className="flex flex-1 flex-wrap gap-1">
          {tags.map(t => (
            <span
              key={t}
              className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400/80"
            >
              {t}
            </span>
          ))}
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={tags.length === 0 ? 'auth, security, patterns…' : ''}
            className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground/40">Comma-separated</p>
    </div>
  );
}

// ─── Edit form (receives page as prop; state initialized directly) ──────────

function EditForm({
  page,
  orgId,
  navigate,
}: {
  page: WikiPage;
  orgId: string | undefined;
  navigate: NavigateFn;
}) {
  const slug = page.slug;
  const upsert = useUpsertWikiPage(orgId);

  // State initialized directly from props — no seeding effect needed.
  const [title, setTitle] = useState(page.title);
  const [summary, setSummary] = useState(page.summary ?? '');
  const [body, setBody] = useState(page.body);
  const [project, setProject] = useState(page.project ?? '');
  const [tags, setTags] = useState((page.tags ?? []).join(', '));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [done, setDone] = useState(false);

  function validate() {
    const errs: Record<string, string> = {};
    if (title.length < 10) errs.title = 'Min 10 chars';
    if (summary.length < 20) errs.summary = 'Min 20 chars';
    if (body.length < 100) errs.body = 'Min 100 chars';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    try {
      await upsert.mutateAsync({
        slug,
        title,
        summary,
        body,
        version: page.version,
        project: project.trim() || undefined,
        tags: tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
      });
      setDone(true);
      setTimeout(() => navigate({ to: '/wiki-browse/$slug', params: { slug } }), 700);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(err.fieldErrors)) mapped[k] = v[0] ?? 'Invalid';
          setFieldErrors(mapped);
        } else {
          setFieldErrors({ _form: err.message });
        }
      }
    }
  }

  const completeness = [title.length >= 10, summary.length >= 20, body.length >= 100].filter(
    Boolean
  ).length;

  return (
    <div>
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <a
          href={`/wiki-browse/${slug}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {page.title}
        </a>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`h-1 w-8 rounded-full transition-all duration-300 ${i < completeness ? 'bg-amber-500' : 'bg-muted/50'}`}
              />
            ))}
            <span className="ml-1 text-xs text-muted-foreground/60">{completeness}/3</span>
          </div>
          <button
            type="button"
            onClick={() => setPreview(p => !p)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {preview ? <PenLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {preview ? 'Edit' : 'Preview'}
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-8">
        <div className="relative">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Untitled page"
            className={`w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/20 transition-colors border-b-2 pb-2 ${fieldErrors.title ? 'border-red-500/50 text-red-400' : title.length > 0 ? 'border-amber-500/40 text-foreground' : 'border-border/30 text-foreground focus:border-amber-500/40'}`}
          />
          {fieldErrors.title && (
            <span className="absolute -bottom-5 left-0 text-xs text-red-400">
              {fieldErrors.title}
            </span>
          )}
        </div>
        <p className="mt-6 text-sm text-muted-foreground/50">Editing · v{page.version}</p>
      </div>

      {fieldErrors._form && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {fieldErrors._form}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left column */}
          <div className="space-y-5 lg:col-span-2">
            <section className="rounded-xl border border-input bg-card p-5 backdrop-blur space-y-4">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-500">
                  01
                </span>
                Identity
              </h2>
              <SlugBar value={slug} />
              <FieldWithCounter
                id="summary"
                label="Summary"
                hint="shown in search"
                value={summary}
                onChange={setSummary}
                placeholder="One or two sentences describing what this page covers…"
                rows={3}
                min={20}
                max={500}
                error={fieldErrors.summary}
              />
            </section>

            <section className="rounded-xl border border-input bg-card p-5 backdrop-blur space-y-4">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-500">
                  02
                </span>
                Metadata
                <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/40">
                  optional
                </span>
              </h2>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Project
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:border-amber-500/60 focus-within:ring-2 focus-within:ring-amber-500/15 transition-all">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  <input
                    type="text"
                    value={project}
                    onChange={e => setProject(e.target.value)}
                    placeholder="backend, frontend, shared…"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/30"
                  />
                </div>
              </div>
              <TagInput value={tags} onChange={setTags} />
            </section>

            <button
              type="submit"
              disabled={upsert.isPending || done}
              className={`relative w-full overflow-hidden rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed ${done ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-black hover:bg-amber-400 active:scale-[0.98]'} before:absolute before:inset-0 before:-translate-x-full before:bg-white/10 hover:before:translate-x-full before:transition-transform before:duration-500`}
            >
              <span className="relative flex items-center justify-center gap-2">
                {done ? (
                  <>
                    <Check className="h-4 w-4" />
                    Saved
                  </>
                ) : upsert.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </span>
            </button>

            <a
              href={`/wiki-browse/${slug}`}
              className="block text-center text-xs text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Discard changes
            </a>
          </div>

          {/* Right column: body editor */}
          <div className="lg:col-span-3">
            <section className="rounded-xl border border-input bg-card backdrop-blur overflow-hidden">
              <div className="flex items-center justify-between border-b border-input px-4 py-2.5">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-amber-500/20 text-[9px] font-bold text-amber-500">
                    03
                  </span>
                  Body <span className="text-muted-foreground/40">· Markdown</span>
                </h2>
                <div className="relative flex rounded-lg bg-muted/40 p-0.5">
                  <div
                    className="absolute inset-y-0.5 rounded-md bg-card shadow-sm transition-all duration-200"
                    style={{ left: preview ? '50%' : '2px', right: preview ? '2px' : '50%' }}
                  />
                  {[
                    {
                      label: 'Write',
                      icon: PenLine,
                      active: !preview,
                      onClick: () => setPreview(false),
                    },
                    {
                      label: 'Preview',
                      icon: Eye,
                      active: preview,
                      onClick: () => setPreview(true),
                    },
                  ].map(tab => (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={tab.onClick}
                      className={`relative flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors z-10 ${tab.active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <tab.icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-4 py-1.5">
                <div className="flex items-center gap-2">
                  <ArcRing value={body.length} min={100} max={100000} />
                  <span
                    className={`text-xs tabular-nums ${body.length > 100000 ? 'text-red-400' : body.length >= 100 ? 'text-amber-500/70' : 'text-muted-foreground/40'}`}
                  >
                    {body.length.toLocaleString()} / 100,000 chars
                    {body.length < 100 && (
                      <span className="ml-1 text-muted-foreground/40">
                        ({100 - body.length} more to go)
                      </span>
                    )}
                  </span>
                </div>
                {fieldErrors.body && (
                  <span className="text-xs text-red-400">{fieldErrors.body}</span>
                )}
              </div>

              {preview ? (
                <div className="min-h-[420px] overflow-auto p-6">
                  {body.trim() ? (
                    <MarkdownRenderer content={body} />
                  ) : (
                    <p className="text-sm text-muted-foreground/40 italic">
                      Nothing to preview yet…
                    </p>
                  )}
                </div>
              ) : (
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={`# ${title || 'Page Title'}\n\nStart writing here. Markdown is supported.`}
                  className={`w-full min-h-[420px] resize-y bg-transparent p-6 font-mono text-sm leading-relaxed text-foreground/90 placeholder:text-muted-foreground/20 outline-none ${fieldErrors.body ? 'bg-red-500/5' : ''}`}
                  spellCheck={false}
                />
              )}
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Route component: loader shell ─────────────────────────────────────────

function EditWikiPagePage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const { selectedOrg, isLoading: isOrgLoading } = useOrganization();
  const orgId = selectedOrg?.id;

  const { data: page, isLoading } = useWikiPage(slug, orgId);

  if (isOrgLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="font-medium">Page not found</p>
        <a href="/wiki-browse" className="mt-4 text-sm text-amber-500 hover:text-amber-400">
          Back to Wiki
        </a>
      </div>
    );
  }

  // key={page.id} ensures EditForm remounts if the page changes (e.g. navigating
  // between edit pages directly), giving fresh state initialization each time.
  return <EditForm key={page.id} page={page} orgId={orgId} navigate={navigate} />;
}
