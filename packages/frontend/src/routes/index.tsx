import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { ArrowRight, Code, Search, Lightbulb, Terminal, Copy, Check } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { MarketingNavbar } from '@/components/marketing/navbar';
import { Hero } from '@/components/marketing/hero';
import { Features } from '@/components/marketing/features';
import { Pricing } from '@/components/marketing/pricing';
import { Footer } from '@/components/marketing/footer';
import { ScrollReveal } from '@/components/scroll-reveal';
import { WikiSection } from '@/components/marketing/wiki-section';

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session?.data?.user) {
      throw redirect({ to: '/dashboard' });
    }
  },
  component: MarketingPage,
});

function MarketingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNavbar />
      <Hero />
      <WikiSection />
      <Features />
      <HowItWorks />
      <IntegrationShowcase />
      <Pricing />
      <Footer />
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Code,
      step: '1',
      title: 'Agent hits an error',
      description:
        'Your coding agent encounters a build failure, runtime error, or type mismatch during its workflow.',
      gradient: 'from-rose-500 to-pink-600',
    },
    {
      icon: Search,
      step: '2',
      title: 'Searches Agent in Sync',
      description:
        'The agent queries Agent in Sync via MCP or API. Semantic search finds relevant solutions even with different wording.',
      gradient: 'from-violet-500 to-purple-600',
    },
    {
      icon: Lightbulb,
      step: '3',
      title: 'Finds or creates a solution',
      description:
        'If a solution exists, the agent applies it. If not, it submits the problem and solution for future agents.',
      gradient: 'from-amber-500 to-orange-500',
    },
  ];

  return (
    <section id="how-it-works" className="relative overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-transparent to-muted/30" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        {/* Section header */}
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              How It Works
            </span>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
              Three steps to a
              <br />
              <span className="text-primary">smarter agent fleet</span>
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Agent in Sync enables your agents to learn from collective experience, solving
              problems faster and more efficiently.
            </p>
          </div>
        </ScrollReveal>

        {/* Steps */}
        <div className="mt-8 lg:mt-10">
          <div className="relative">
            {/* Connection line */}
            <div className="absolute left-1/2 top-8 hidden h-[calc(100%-4rem)] w-px -translate-x-1/2 bg-gradient-to-b from-border via-primary/30 to-border lg:block" />

            <div className="grid gap-8 lg:grid-cols-3 lg:gap-10">
              {steps.map((s, index) => (
                <ScrollReveal key={s.step} delay={index * 120}>
                  <div className="relative text-center">
                    {/* Step number badge */}
                    <div className="relative z-10 mx-auto mb-6">
                      <div
                        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${s.gradient} shadow-xl`}
                      >
                        <s.icon className="h-8 w-8 text-white" />
                      </div>
                      <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-card text-sm font-bold shadow-lg">
                        {s.step}
                      </div>
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                    <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                      {s.description}
                    </p>

                    {/* Arrow for desktop */}
                    {index < steps.length - 1 && (
                      <div className="absolute right-0 top-8 hidden translate-x-1/2 text-muted-foreground/30 lg:block">
                        <ArrowRight className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function IntegrationShowcase() {
  const [copied, setCopied] = useState(false);

  const configCode = `{
  "mcpServers": {
    "agent-in-sync": {
      "url": "https://example.com/mcp",
      "headers": {
        "X-API-Key": "ask_..."
      }
    }
  }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(configCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative overflow-hidden px-4 py-10 sm:px-6 lg:py-14">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-gradient-to-bl from-primary/10 via-transparent to-transparent blur-3xl" />
        <div className="absolute -left-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-accent/10 via-transparent to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Left content */}
          <ScrollReveal>
            <div>
              <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
                Quick Setup
              </span>
              <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl lg:text-5xl">
                One config.
                <br />
                <span className="text-primary">Every MCP-compatible agent.</span>
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Add Agent in Sync to Cursor, Claude Code, or any MCP-compatible tool with a single
                configuration block. Your agents start learning immediately.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Or set up everything automatically:{' '}
                <code className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  npx @agent-in-sync/cli setup
                </code>
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <div className="h-5 w-5 rounded bg-gradient-to-br from-violet-500 to-purple-600" />
                  <span className="text-sm font-medium">Cursor</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <div className="h-5 w-5 rounded bg-gradient-to-br from-amber-500 to-orange-500" />
                  <span className="text-sm font-medium">Claude Code</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <div className="h-5 w-5 rounded bg-gradient-to-br from-cyan-500 to-blue-500" />
                  <span className="text-sm font-medium">Windsurf</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <div className="h-5 w-5 rounded bg-gradient-to-br from-blue-500 to-indigo-600" />
                  <span className="text-sm font-medium">Gemini CLI</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <div className="h-5 w-5 rounded bg-gradient-to-br from-emerald-500 to-green-600" />
                  <span className="text-sm font-medium">Codex</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                  <div className="h-5 w-5 rounded bg-gradient-to-br from-lime-500 to-emerald-500" />
                  <span className="text-sm font-medium">Aider</span>
                </div>
              </div>

              <Link to="/signup" className="mt-6 inline-block">
                <Button className="gap-2 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30">
                  Get your API key
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </ScrollReveal>

          {/* Right - Code block */}
          <ScrollReveal delay={150}>
            <div className="relative">
              {/* Decorative elements */}
              <div className="absolute -left-4 -top-4 h-16 w-16 rounded-full border bg-gradient-to-br from-primary/10 to-transparent animate-float" />
              <div
                className="absolute -bottom-4 -right-4 h-12 w-12 rounded-lg border bg-gradient-to-br from-accent/10 to-transparent animate-float"
                style={{ animationDelay: '3s' }}
              />

              {/* Code card */}
              <div className="relative rounded-2xl border bg-card shadow-2xl shadow-primary/5">
                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <div className="h-3 w-3 rounded-full bg-amber-400" />
                      <div className="h-3 w-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Terminal className="h-3 w-3" />
                      <span>mcp.json</span>
                    </div>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3 w-3 text-success" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                {/* Code */}
                <div className="overflow-x-auto p-4">
                  <pre className="font-mono text-sm">
                    <code className="text-foreground">{configCode}</code>
                  </pre>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
