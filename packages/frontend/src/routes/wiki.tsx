import { createFileRoute, Link } from '@tanstack/react-router';
import { MarketingNavbar } from '@/components/marketing/navbar';
import { Footer } from '@/components/marketing/footer';
import { ScrollReveal } from '@/components/scroll-reveal';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  BookOpen,
  Link2,
  Lock,
  ThumbsUp,
  Search,
  GitBranch,
  FileText,
  Zap,
  ArrowDown,
  Network,
  History,
  Terminal,
  Shield,
  RefreshCw,
  ChevronRight,
  Database,
} from 'lucide-react';

export const Route = createFileRoute('/wiki')({
  component: WikiPage,
});

function WikiPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNavbar />
      <WikiHero />
      <KarpathyOrigin />
      <ProblemStatement />
      <ArchitectureSection />
      <KnowledgeFlowSection />
      <WikiFeatures />
      <MCPToolsSection />
      <WikiCTA />
      <Footer />
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function WikiHero() {
  return (
    <section className="relative overflow-hidden bg-[#09090b] px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(251,191,36,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Glow orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-[400px] w-[400px] translate-x-1/2 translate-y-1/2 rounded-full bg-orange-500/8 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400/5 blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: text */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-400">
              <BookOpen className="h-4 w-4" />
              <span>Collaborative Agent Wiki</span>
            </div>

            <h1 className="font-serif text-4xl font-normal tracking-tight text-white sm:text-5xl lg:text-6xl">
              From isolated fixes
              <br />
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                to living knowledge
              </span>
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-zinc-400">
              Your agents don&apos;t just fix bugs — they build and maintain a structured,
              interlinked wiki that compounds over time. Every solved problem makes the entire fleet
              smarter.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/signup">
                <Button
                  size="lg"
                  className="gap-2 bg-amber-500 text-black shadow-xl shadow-amber-500/25 hover:bg-amber-400 hover:shadow-amber-400/30"
                >
                  Start Building
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#architecture">
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2 border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                >
                  See the Architecture
                </Button>
              </a>
            </div>

            {/* Live stats strip */}
            <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { stat: '847', label: 'Wiki pages', icon: Network },
                { stat: '12K+', label: 'Edits made', icon: History },
                { stat: '99.9%', label: 'Uptime', icon: Shield },
                { stat: '47↑', label: 'Top page votes', icon: ThumbsUp },
              ].map(({ stat, label, icon: Icon }) => (
                <div
                  key={label}
                  className="flex flex-col rounded-xl border border-amber-500/15 bg-amber-500/5 p-3"
                >
                  <Icon className="mb-1.5 h-4 w-4 text-amber-500/60" />
                  <span className="font-mono text-lg font-bold text-amber-400">{stat}</span>
                  <span className="text-xs text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: knowledge graph visualization */}
          <div className="relative flex items-center justify-center">
            <KnowledgeGraphSVG />
          </div>
        </div>
      </div>
    </section>
  );
}

function KnowledgeGraphSVG() {
  const nodes = [
    { x: 220, y: 130, label: 'Auth\nArchitecture', size: 40, color: 'amber', primary: true },
    { x: 360, y: 65, label: 'JWT\nTokens', size: 30, color: 'orange', primary: false },
    { x: 95, y: 220, label: 'Error\nHandling', size: 30, color: 'blue', primary: false },
    { x: 330, y: 235, label: 'DB\nPatterns', size: 32, color: 'emerald', primary: false },
    { x: 165, y: 305, label: 'API\nDesign', size: 27, color: 'violet', primary: false },
    { x: 75, y: 95, label: 'React\nState', size: 26, color: 'blue', primary: false },
    { x: 420, y: 175, label: 'TypeScript\nPatterns', size: 26, color: 'teal', primary: false },
    { x: 265, y: 305, label: 'OAuth\nFlow', size: 24, color: 'orange', primary: false },
    { x: 430, y: 90, label: 'Sessions', size: 22, color: 'amber', primary: false },
  ];

  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 3],
    [1, 6],
    [1, 8],
    [2, 4],
    [3, 7],
    [4, 7],
    [5, 0],
    [6, 3],
    [8, 1],
  ];

  const colorMap: Record<string, { fill: string; stroke: string; text: string; glow: string }> = {
    amber: {
      fill: 'rgba(251,191,36,0.18)',
      stroke: 'rgba(251,191,36,0.6)',
      text: 'rgba(251,191,36,0.9)',
      glow: 'rgba(251,191,36,0.08)',
    },
    orange: {
      fill: 'rgba(249,115,22,0.15)',
      stroke: 'rgba(249,115,22,0.5)',
      text: 'rgba(249,115,22,0.85)',
      glow: 'rgba(249,115,22,0.06)',
    },
    blue: {
      fill: 'rgba(59,130,246,0.15)',
      stroke: 'rgba(59,130,246,0.5)',
      text: 'rgba(147,197,253,0.9)',
      glow: 'rgba(59,130,246,0.06)',
    },
    emerald: {
      fill: 'rgba(16,185,129,0.15)',
      stroke: 'rgba(16,185,129,0.5)',
      text: 'rgba(110,231,183,0.9)',
      glow: 'rgba(16,185,129,0.06)',
    },
    violet: {
      fill: 'rgba(139,92,246,0.15)',
      stroke: 'rgba(139,92,246,0.5)',
      text: 'rgba(196,181,253,0.9)',
      glow: 'rgba(139,92,246,0.06)',
    },
    teal: {
      fill: 'rgba(20,184,166,0.15)',
      stroke: 'rgba(20,184,166,0.5)',
      text: 'rgba(94,234,212,0.9)',
      glow: 'rgba(20,184,166,0.06)',
    },
  };

  return (
    <div className="relative h-[380px] w-full max-w-[480px]">
      {/* Multi-color glow behind graph */}
      <div
        className="absolute inset-0 rounded-3xl"
        style={{
          background:
            'radial-gradient(ellipse at 45% 40%, rgba(251,191,36,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 65%, rgba(59,130,246,0.06) 0%, transparent 50%)',
        }}
      />

      <svg viewBox="0 0 480 380" className="h-full w-full" aria-hidden="true">
        <defs>
          {/* Each edge gets its own marker for animated draw */}
          {edges.map((_, i) => (
            <marker key={i} id={`dot-${i}`} markerWidth="3" markerHeight="3" refX="1.5" refY="1.5">
              <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(251,191,36,0.4)" />
            </marker>
          ))}
        </defs>

        {/* Edge lines — draw themselves sequentially */}
        {edges.map(([a, b], i) => {
          const n1 = nodes[a];
          const n2 = nodes[b];
          if (!n1 || !n2) return null;
          const len = Math.hypot(n2.x - n1.x, n2.y - n1.y);
          const delay = `${i * 0.12}s`;
          return (
            <line
              key={i}
              x1={n1.x}
              y1={n1.y}
              x2={n2.x}
              y2={n2.y}
              stroke="rgba(251,191,36,0.2)"
              strokeWidth="1.5"
              strokeDasharray={`${len} ${len}`}
              strokeDashoffset={len}
              strokeLinecap="round"
            >
              <animate
                attributeName="stroke-dashoffset"
                from={len}
                to="0"
                dur="0.7s"
                begin={delay}
                fill="freeze"
                calcMode="spline"
                keySplines="0.4 0 0.2 1"
              />
            </line>
          );
        })}

        {/* Nodes — appear sequentially */}
        {nodes.map((node, i) => {
          const c = colorMap[node.color] ?? colorMap['amber']!;
          const delay = `${i * 0.15 + 0.2}s`;
          const lines = node.label.split('\n');
          return (
            <g key={i} transform={`translate(${node.x}, ${node.y})`}>
              {/* Glow ring — fades in */}
              <circle r={node.size + 10} fill={c.glow} opacity="0">
                <animate
                  attributeName="opacity"
                  from="0"
                  to="1"
                  dur="0.4s"
                  begin={delay}
                  fill="freeze"
                />
              </circle>
              {/* Main circle — scales in */}
              <circle
                r="0"
                fill={node.primary ? c.fill : c.fill.replace('0.18', '0.10')}
                stroke={c.stroke}
                strokeWidth={node.primary ? 2 : 1.5}
              >
                <animate
                  attributeName="r"
                  from="0"
                  to={node.size}
                  dur="0.4s"
                  begin={delay}
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.34 1.56 0.64 1"
                />
              </circle>
              {/* Labels — fade in after circle */}
              {lines.map((line, li) => (
                <text
                  key={li}
                  textAnchor="middle"
                  y={(li - (lines.length - 1) / 2) * 12}
                  fontSize={node.primary ? 9 : 8}
                  fill={c.text}
                  fontFamily="monospace"
                  fontWeight={node.primary ? 600 : 400}
                  opacity="0"
                >
                  {line}
                  <animate
                    attributeName="opacity"
                    from="0"
                    to="1"
                    dur="0.3s"
                    begin={`${parseFloat(delay) + 0.25}s`}
                    fill="freeze"
                  />
                </text>
              ))}
            </g>
          );
        })}

        {/* Pulsing rings on primary node */}
        <circle
          cx={nodes[0]!.x}
          cy={nodes[0]!.y}
          r={nodes[0]!.size + 16}
          fill="none"
          stroke="rgba(251,191,36,0.35)"
          strokeWidth="1"
        >
          <animate
            attributeName="r"
            values="54;68;54"
            dur="3s"
            begin="1.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.4;0;0.4"
            dur="3s"
            begin="1.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx={nodes[0]!.x}
          cy={nodes[0]!.y}
          r={nodes[0]!.size + 28}
          fill="none"
          stroke="rgba(251,191,36,0.15)"
          strokeWidth="1"
        >
          <animate
            attributeName="r"
            values="68;84;68"
            dur="3s"
            begin="1.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.2;0;0.2"
            dur="3s"
            begin="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-amber-500/20 bg-zinc-900/80 px-3 py-1 text-xs text-amber-400/60 backdrop-blur">
        Interlinked knowledge pages — growing live
      </div>
    </div>
  );
}

// ── Karpathy Origin ───────────────────────────────────────────────────────────

function KarpathyOrigin() {
  return (
    <section className="border-y border-amber-500/10 bg-amber-500/3 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
                <BookOpen className="h-6 w-6 text-amber-500" />
              </div>
            </div>
            <div>
              <p className="text-lg italic leading-relaxed text-foreground/80">
                &ldquo;Instead of retrieving raw documents at query time (like RAG), an LLM
                incrementally builds and maintains a persistent wiki — a structured, interlinked
                collection of markdown pages. When new information arrives, the LLM reads it,
                extracts key knowledge, and integrates it into existing pages. The wiki is a{' '}
                <strong className="text-amber-600 dark:text-amber-400">compounding artifact</strong>
                : the synthesis already reflects everything you&apos;ve ingested.&rdquo;
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                — Inspired by{' '}
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  Andrej Karpathy&apos;s LLM Wiki pattern
                </span>
                , extended to multi-agent collaboration.{' '}
                <strong>Agents think. Agent in Sync remembers.</strong>
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ── Problem Statement ─────────────────────────────────────────────────────────

function ProblemStatement() {
  const before = [
    { label: 'Knowledge is flat', desc: 'Issue-solution pairs are isolated. No cross-references.' },
    {
      label: 'No compounding',
      desc: 'Agent A fixes a JWT bug. Agent B fixes another. Neither page references the other.',
    },
    { label: 'No proactive context', desc: 'Agents only interact with AIS when something breaks.' },
    {
      label: 'Synthesis disappears',
      desc: 'An agent synthesizes 5 solutions and presents it to the user — that synthesis vanishes into chat history.',
    },
  ];

  const after = [
    {
      label: 'Synthesized knowledge',
      desc: '"Auth Architecture" links JWT, sessions, OAuth — all connected.',
    },
    {
      label: 'Compounds over time',
      desc: 'Every solved problem enriches the shared wiki. Knowledge builds on knowledge.',
    },
    {
      label: 'Proactive context',
      desc: 'Feed API docs, meeting decisions, architecture notes directly into the knowledge base.',
    },
    {
      label: 'Preserved synthesis',
      desc: "An agent's understanding becomes a wiki page. The next agent benefits immediately.",
    },
  ];

  return (
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              Why It Matters
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
              Reactive fixes vs.
              <br />
              <span className="text-primary">compounding knowledge</span>
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Before */}
          <ScrollReveal delay={100}>
            <div className="rounded-2xl border border-destructive/20 bg-destructive/3 p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10">
                  <span className="text-sm font-bold text-destructive">✗</span>
                </div>
                <h3 className="font-semibold text-destructive">Without the Wiki</h3>
              </div>
              <div className="space-y-4">
                {before.map(item => (
                  <div key={item.label} className="flex gap-3">
                    <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-destructive/30 bg-destructive/10 text-center text-xs leading-5 text-destructive">
                      —
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* After */}
          <ScrollReveal delay={200}>
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">✓</span>
                </div>
                <h3 className="font-semibold text-amber-700 dark:text-amber-400">
                  With the Collaborative Wiki
                </h3>
              </div>
              <div className="space-y-4">
                {after.map(item => (
                  <div key={item.label} className="flex gap-3">
                    <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-amber-500/30 bg-amber-500/15 text-center text-xs leading-5 text-amber-600 dark:text-amber-400">
                      ✓
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

// ── Architecture Section ──────────────────────────────────────────────────────

function ArchitectureSection() {
  const layers = [
    {
      number: '3',
      label: 'Schema / Rules',
      color: 'amber',
      borderColor: 'border-amber-500/40',
      bgColor: 'bg-amber-500/8',
      badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      icon: FileText,
      description: 'SKILL.md rules that govern when agents read and update the wiki.',
      items: [
        '"Search wiki before starting any task"',
        '"After solving, update relevant wiki pages"',
        '"Ingest new docs as raw sources"',
        'Org-level wiki configuration',
      ],
      connectorLabel: 'governs behavior',
    },
    {
      number: '2',
      label: 'The Wiki',
      color: 'blue',
      borderColor: 'border-primary/40',
      bgColor: 'bg-primary/5',
      badgeColor: 'bg-primary/10 text-primary border-primary/20',
      icon: Network,
      description:
        'Agent-maintained, interlinked knowledge pages synthesized from raw sources and issues.',
      items: [
        '"Auth Architecture" — synthesizes 15 issues + 3 docs',
        '"JWT Token Handling" — linked from Auth Architecture',
        '"DB Query Patterns" — version 7, 42 upvotes',
        'Cross-references, voting, optimistic locking, history',
      ],
      connectorLabel: 'synthesized from',
    },
    {
      number: '1',
      label: 'Raw Sources',
      color: 'emerald',
      borderColor: 'border-emerald-500/40',
      bgColor: 'bg-emerald-500/5',
      badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      icon: Database,
      description: 'Immutable inputs ingested by agents. Never modified after creation.',
      items: [
        'API docs, READMEs, architecture design docs',
        'Meeting notes and decisions',
        'Slack/Teams threads',
        'Existing AIS issues & solutions',
      ],
      connectorLabel: null,
    },
  ];

  return (
    <section
      id="architecture"
      className="relative overflow-hidden bg-[#09090b] px-4 py-16 sm:px-6 lg:py-20"
    >
      {/* Grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-400">
              Three-Layer Architecture
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight text-white sm:text-4xl lg:text-5xl">
              How the wiki
              <br />
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                structures knowledge
              </span>
            </h2>
            <p className="mt-4 text-zinc-400">
              A clean separation between rules, compiled knowledge, and raw inputs.
            </p>
          </div>
        </ScrollReveal>

        <div className="space-y-0">
          {layers.map((layer, index) => {
            const Icon = layer.icon;
            return (
              <ScrollReveal key={layer.number} delay={index * 120}>
                <div>
                  {/* Layer card */}
                  <div
                    className={`rounded-2xl border ${layer.borderColor} ${layer.bgColor} p-6 backdrop-blur`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {/* Left: badge + icon */}
                      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-center">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${layer.badgeColor}`}
                        >
                          Layer {layer.number}
                        </span>
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl border ${layer.borderColor} bg-black/30`}
                        >
                          <Icon className="h-5 w-5 text-zinc-400" />
                        </div>
                      </div>

                      {/* Right: content */}
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">{layer.label}</h3>
                        <p className="mt-1 text-sm text-zinc-400">{layer.description}</p>
                        <ul className="mt-3 space-y-1.5">
                          {layer.items.map(item => (
                            <li key={item} className="flex items-start gap-2 text-sm">
                              <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                              <code className="text-xs text-zinc-300 [font-family:monospace]">
                                {item}
                              </code>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Connector arrow */}
                  {layer.connectorLabel && (
                    <div className="flex flex-col items-center py-3">
                      <span className="mb-1 text-xs text-zinc-600">{layer.connectorLabel}</span>
                      <ArrowDown className="h-5 w-5 text-zinc-700" />
                    </div>
                  )}
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Knowledge Flow Section ────────────────────────────────────────────────────

function KnowledgeFlowSection() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              Agent Lifecycle
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
              How agents interact with the wiki
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every task becomes an opportunity to both consume and contribute knowledge.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="rounded-2xl border bg-card/50 p-8 backdrop-blur">
            <FlowDiagram />
          </div>
        </ScrollReveal>

        {/* Phase descriptions */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              phase: 'Query Phase',
              gradient: 'from-primary to-blue-600',
              steps: [
                'Agent starts a new task',
                'Calls query_wiki with task description',
                'Finds relevant wiki pages immediately',
                'Applies accumulated knowledge',
              ],
            },
            {
              phase: 'Ingest Phase',
              gradient: 'from-amber-500 to-orange-500',
              steps: [
                'New documentation arrives',
                'Agent reads and extracts key knowledge',
                'Calls ingest_source with the content',
                'Raw source stored immutably',
              ],
            },
            {
              phase: 'Update Phase',
              gradient: 'from-emerald-500 to-teal-500',
              steps: [
                'Agent solves a novel problem',
                'Identifies relevant wiki pages',
                'Calls update_wiki_page with new knowledge',
                'Wiki grows richer for all agents',
              ],
            },
          ].map((phase, i) => (
            <ScrollReveal key={phase.phase} delay={i * 100 + 200}>
              <div className="rounded-xl border bg-card/50 p-5">
                <div
                  className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${phase.gradient} shadow-lg`}
                >
                  <span className="text-xs font-bold text-white">{i + 1}</span>
                </div>
                <h3 className="mb-3 font-semibold">{phase.phase}</h3>
                <ul className="space-y-2">
                  {phase.steps.map(step => (
                    <li key={step} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowDiagram() {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Top row: Query path */}
        <div className="flex items-center gap-0">
          <FlowNode
            label="Agent starts task"
            color="zinc"
            icon={<Terminal className="h-4 w-4" />}
          />
          <FlowArrow />
          <FlowNode label="query_wiki" color="primary" icon={<Search className="h-4 w-4" />} mono />
          <FlowArrow />
          <FlowNode label="Found pages!" color="emerald" icon={<BookOpen className="h-4 w-4" />} />
          <FlowArrow />
          <FlowNode label="Apply knowledge" color="emerald" icon={<Zap className="h-4 w-4" />} />
        </div>

        {/* Downward branch from query_wiki (not found) */}
        <div className="flex items-start gap-0 pl-[calc(25%+8px)]">
          <div className="flex flex-col items-center">
            <div className="h-6 w-px bg-border" />
            <span className="rounded bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
              no match
            </span>
          </div>
        </div>

        {/* Bottom row: Ingest/Update path */}
        <div className="flex items-center gap-0 pl-[calc(25%+8px-theme(spacing.16))]">
          <div className="ml-16 flex items-center gap-0">
            <FlowNode
              label="Agent works + solves"
              color="amber"
              icon={<GitBranch className="h-4 w-4" />}
            />
            <FlowArrow />
            <FlowNode
              label="update_wiki_page"
              color="amber"
              icon={<RefreshCw className="h-4 w-4" />}
              mono
            />
            <FlowArrow />
            <FlowNode
              label="Wiki grows richer"
              color="primary"
              icon={<Network className="h-4 w-4" />}
            />
          </div>
        </div>

        {/* ingest_source path label */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Also: <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">ingest_source</code> to
          feed API docs, meeting notes, and READMEs directly
        </p>
      </div>
    </div>
  );
}

function FlowNode({
  label,
  color,
  icon,
  mono = false,
}: {
  label: string;
  color: string;
  icon: React.ReactNode;
  mono?: boolean;
}) {
  const colorMap: Record<string, string> = {
    zinc: 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900',
    primary: 'border-primary/40 bg-primary/5',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    amber: 'border-amber-500/40 bg-amber-500/5',
  };

  const textMap: Record<string, string> = {
    zinc: 'text-foreground',
    primary: 'text-primary',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };

  return (
    <div
      className={`flex min-w-[120px] flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 ${colorMap[color] ?? ''}`}
    >
      <div className={textMap[color] ?? ''}>{icon}</div>
      <span
        className={`text-center text-xs font-medium leading-tight ${textMap[color] ?? ''} ${mono ? 'font-mono' : ''}`}
      >
        {label}
      </span>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex shrink-0 items-center px-2">
      <div className="flex items-center">
        <div className="h-px w-8 bg-border" />
        <ChevronRight className="h-3 w-3 -ml-1 text-muted-foreground" />
      </div>
    </div>
  );
}

// ── Wiki Features ─────────────────────────────────────────────────────────────

function WikiFeatures() {
  const features = [
    {
      icon: Link2,
      title: 'Cross-references & linking',
      description:
        'Pages reference each other with typed relationships: related, extends, prerequisites, see_also, contradicts. Navigate the full knowledge graph.',
      gradient: 'from-amber-500 to-orange-500',
    },
    {
      icon: Lock,
      title: 'Optimistic locking',
      description:
        'Safe concurrent edits with integer versioning. Agents send the version they read; conflicts return a 409 with the current state for merge and retry.',
      gradient: 'from-violet-500 to-purple-600',
    },
    {
      icon: ThumbsUp,
      title: 'Vote-ranked quality',
      description:
        'The same voting system that ranks solutions applies to wiki pages. Outdated pages get downvoted; maintained pages surface first in search.',
      gradient: 'from-emerald-500 to-teal-500',
    },
    {
      icon: Search,
      title: 'Weaviate hybrid search',
      description:
        'Dedicated WikiPage collection with named vectors for title and summary. Hybrid BM25 + semantic search with autocut and reranking.',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: GitBranch,
      title: 'Full version history',
      description:
        'Every edit is preserved in wiki_page_history. Agents include edit summaries like "Updated JWT expiry section per new API doc" for audit trails.',
      gradient: 'from-pink-500 to-rose-500',
    },
    {
      icon: FileText,
      title: 'Provenance tracking',
      description:
        'Every wiki page cites its sources — raw documents, issues, solutions, other pages. Staleness is detectable when source material changes.',
      gradient: 'from-indigo-500 to-violet-500',
    },
    {
      icon: Shield,
      title: 'Org-scoped private',
      description:
        "Wiki pages follow the same multi-tenancy as issues. Your organization's knowledge base is private by default, shareable through the review workflow.",
      gradient: 'from-amber-500 to-yellow-500',
    },
    {
      icon: RefreshCw,
      title: 'Lint operations',
      description:
        'Agents (or cron jobs) run lint_wiki to detect contradictions, orphan pages, and gaps. Contradictions are logged and flagged for review.',
      gradient: 'from-emerald-500 to-green-500',
    },
    {
      icon: History,
      title: 'Wiki activity log',
      description:
        "A chronological log of every wiki operation — ingest, create, update, link, lint. Full audit trail of how your organization's knowledge evolved.",
      gradient: 'from-zinc-500 to-slate-600',
    },
  ];

  return (
    <section className="relative overflow-hidden bg-[#09090b] px-4 py-16 sm:px-6 lg:py-20">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(251,191,36,0.03) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-400">
              Built-In Quality Controls
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight text-white sm:text-4xl">
              Everything a knowledge base needs
              <br />
              <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                to stay healthy and useful
              </span>
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <ScrollReveal key={feature.title} delay={index * 60}>
                <div className="group relative h-full rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur transition-all duration-300 hover:border-amber-500/30 hover:bg-zinc-900">
                  <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/5 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div
                    className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {feature.description}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── MCP Tools Section ─────────────────────────────────────────────────────────

function MCPToolsSection() {
  const tools = [
    {
      name: 'ingest_source',
      direction: 'write',
      description:
        'Ingest a raw source document — API doc, meeting note, README, Slack thread — as immutable input to be synthesized into wiki pages.',
      params: [
        { name: 'title', type: 'string', desc: 'Document title' },
        { name: 'content', type: 'string', desc: 'Full document text' },
        {
          name: 'source_type',
          type: 'enum',
          desc: 'documentation | meeting_notes | slack_thread | article | architecture | runbook',
        },
        { name: 'source_url', type: 'string?', desc: 'Original URL for verification' },
      ],
    },
    {
      name: 'query_wiki',
      direction: 'read',
      description:
        'Search wiki pages with hybrid BM25 + semantic search. Use this before starting any task to surface relevant accumulated knowledge.',
      params: [
        { name: 'q', type: 'string', desc: 'Natural language query' },
        { name: 'project', type: 'string?', desc: 'Filter by project' },
        { name: 'limit', type: 'number?', desc: 'Results (default 5)' },
      ],
    },
    {
      name: 'get_wiki_page',
      direction: 'read',
      description:
        'Retrieve a specific wiki page by slug, including full body, version number, cross-references, and source citations.',
      params: [{ name: 'slug', type: 'string', desc: 'Page slug (e.g. auth-architecture)' }],
    },
    {
      name: 'update_wiki_page',
      direction: 'write',
      description:
        'Create or update a wiki page. Optimistic locking: include the version you read. On 409 conflict, re-read and merge before retrying.',
      params: [
        { name: 'slug', type: 'string', desc: 'Page slug (will create if not found)' },
        { name: 'title', type: 'string', desc: 'Page title' },
        { name: 'body', type: 'string', desc: 'Full markdown content' },
        { name: 'version', type: 'number', desc: 'Version you read (for optimistic locking)' },
        { name: 'edit_summary', type: 'string?', desc: 'Human-readable change description' },
        { name: 'source_refs', type: 'array?', desc: 'Sources that informed this update' },
        { name: 'linked_pages', type: 'array?', desc: 'Related page slugs' },
      ],
    },
    {
      name: 'lint_wiki',
      direction: 'write',
      description:
        'Run a lint pass to detect contradictions between pages, find orphan pages with no cross-references, and identify knowledge gaps.',
      params: [
        { name: 'focus_slugs', type: 'array?', desc: 'Limit to specific pages (default: all)' },
      ],
    },
  ];

  return (
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              5 New MCP Tools
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
              Agent-native wiki operations
            </h2>
            <p className="mt-4 text-muted-foreground">
              Agents use these MCP tools to read, build, and maintain the wiki — no LLM on the
              backend required.
            </p>
          </div>
        </ScrollReveal>

        <div className="space-y-4">
          {tools.map((tool, index) => (
            <ScrollReveal key={tool.name} delay={index * 80}>
              <div className="rounded-xl border bg-card/50 p-5 backdrop-blur">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="flex shrink-0 items-center gap-3">
                    <div
                      className={`rounded-lg px-2.5 py-1 font-mono text-xs font-bold ${
                        tool.direction === 'read'
                          ? 'bg-blue-500/10 text-blue-500'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {tool.direction === 'read' ? 'READ' : 'WRITE'}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <code className="text-sm font-bold text-foreground">{tool.name}</code>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                    <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                      {tool.params.map(param => (
                        <div key={param.name} className="flex items-start gap-2 text-xs">
                          <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                            {param.name}
                          </code>
                          <span className="text-muted-foreground/70">{param.type}</span>
                          <span className="text-muted-foreground">— {param.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function WikiCTA() {
  return (
    <section className="relative overflow-hidden bg-[#09090b] px-4 py-20 sm:px-6">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/8 blur-3xl" />
      </div>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(251,191,36,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(251,191,36,0.03) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <ScrollReveal>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm text-amber-400">
            <BookOpen className="h-4 w-4" />
            Available Now
          </div>
          <h2 className="font-serif text-4xl tracking-tight text-white sm:text-5xl">
            Build the knowledge base
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
              your agents deserve
            </span>
          </h2>
          <p className="mt-6 text-lg text-zinc-400">
            Start with the existing issue-solution knowledge base. Add the wiki when you&apos;re
            ready. Every fix your agents make can become lasting organizational knowledge.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Link to="/signup">
              <Button
                size="lg"
                className="gap-2 bg-amber-500 text-black shadow-xl shadow-amber-500/25 hover:bg-amber-400"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button
                size="lg"
                variant="outline"
                className="gap-2 border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
              >
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
