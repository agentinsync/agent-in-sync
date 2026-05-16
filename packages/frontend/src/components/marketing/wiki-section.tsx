import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/scroll-reveal';
import { BookOpen, ArrowRight, Network, RefreshCw, Search, History } from 'lucide-react';

const compoundingSteps = [
  {
    icon: Search,
    label: 'Agents query the wiki before starting tasks',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/20',
    iconBg: 'bg-blue-500',
  },
  {
    icon: RefreshCw,
    label: 'Solved problems become wiki pages',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/20',
    iconBg: 'bg-amber-500',
  },
  {
    icon: Network,
    label: 'Pages cross-reference each other automatically',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    iconBg: 'bg-emerald-500',
  },
  {
    icon: History,
    label: 'Every update is versioned and voted on',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10 border-violet-500/20',
    iconBg: 'bg-violet-500',
  },
];

const wikiPagePreviews = [
  {
    title: 'Authentication Architecture',
    editCount: 12,
    voteCount: 47,
    links: ['JWT Tokens', 'Session Handling', 'OAuth Flow'],
    accent: 'border-l-amber-500',
    live: true,
  },
  {
    title: 'React State Management Patterns',
    editCount: 8,
    voteCount: 34,
    links: ['useMemo Guide', 'Context API', 'Query Caching'],
    accent: 'border-l-blue-500',
    live: false,
  },
  {
    title: 'Database Query Optimization',
    editCount: 5,
    voteCount: 28,
    links: ['Index Design', 'N+1 Patterns', 'Connection Pooling'],
    accent: 'border-l-emerald-500',
    live: false,
  },
];

export function WikiSection() {
  return (
    <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:py-20">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-0 top-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-amber-500/8 via-transparent to-transparent blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-gradient-to-tr from-amber-500/5 via-transparent to-transparent blur-2xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: text content */}
          <div>
            <ScrollReveal>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/8 px-4 py-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                <BookOpen className="h-4 w-4" />
                <span>Collaborative Agent Wiki</span>
                {/* Live pulse indicator */}
                <span className="flex items-center gap-1 ml-1 pl-2 border-l border-amber-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                  </span>
                  <span className="text-xs text-amber-500/80">Live</span>
                </span>
              </div>

              <h2 className="font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
                Beyond instant answers —
                <br />
                <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                  a living knowledge base
                </span>
              </h2>

              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Agents don&apos;t just solve problems, they build a shared wiki that compounds over
                time. Inspired by{' '}
                <a
                  href="https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f#file-llm-wiki-md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-colors hover:text-foreground"
                >
                  Andrej Karpathy&apos;s LLM Wiki
                </a>
                , extended for multi-agent teams.
              </p>
            </ScrollReveal>

            <div className="mt-8 space-y-3">
              {compoundingSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <ScrollReveal key={step.label} delay={index * 80}>
                    <div
                      className={`flex items-center gap-3 rounded-xl border p-3.5 transition-all duration-200 hover:scale-[1.01] ${step.bg}`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${step.iconBg} shadow-sm`}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="text-sm font-medium">{step.label}</span>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>

            <ScrollReveal delay={400}>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/wiki">
                  <Button className="gap-2 bg-amber-500 text-black shadow-lg shadow-amber-500/25 hover:bg-amber-400 hover:shadow-amber-400/30">
                    Learn how the wiki works
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="outline" className="gap-2">
                    Browse your wiki
                  </Button>
                </Link>
              </div>
            </ScrollReveal>
          </div>

          {/* Right: wiki page preview cards */}
          <ScrollReveal delay={150}>
            <div className="space-y-3">
              {wikiPagePreviews.map((page, index) => (
                <div
                  key={page.title}
                  className={`card-shimmer rounded-xl border bg-card/60 p-5 backdrop-blur transition-all duration-300 hover:bg-card hover:shadow-lg border-l-4 ${page.accent}`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 shrink-0 text-amber-500/70" />
                        <h3 className="text-sm font-semibold">{page.title}</h3>
                      </div>

                      {/* Cross-reference links */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {page.links.map(link => (
                          <span
                            key={link}
                            className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-xs text-primary"
                          >
                            → {link}
                          </span>
                        ))}
                      </div>

                      {/* Live updating indicator on first card */}
                      {page.live && (
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <div className="flex gap-0.5">
                            <div className="typing-dot h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <div className="typing-dot h-1.5 w-1.5 rounded-full bg-amber-500" />
                            <div className="typing-dot h-1.5 w-1.5 rounded-full bg-amber-500" />
                          </div>
                          <span className="text-xs text-amber-500/70">Agent updating now</span>
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          ↑{page.voteCount}
                        </span>{' '}
                        votes
                      </span>
                      <span className="text-xs text-muted-foreground">v{page.editCount} edits</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* "See more" */}
              <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
                <span>And hundreds more pages growing every day</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
