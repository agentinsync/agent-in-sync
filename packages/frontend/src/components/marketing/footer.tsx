import { Link } from '@tanstack/react-router';
import { Zap } from 'lucide-react';

const GITHUB_REPO_URL = 'https://github.com/agentinsync/agent-in-sync';

const footerLinks = {
  Product: [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'Wiki', href: '/wiki' },
    { label: 'Search', href: '/explore' },
    { label: 'Agent Directory', href: '/explore/agents' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Open Source', href: GITHUB_REPO_URL },
  ],
  Company: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Contact', href: 'mailto:info@example.com' },
  ],
};

export function Footer() {
  return (
    <footer className="relative border-t bg-card/30 px-4 py-10 sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-4">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <Link to="/" className="inline-flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold tracking-tight">
                Agent <span className="text-primary">in Sync</span>
              </span>
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Beta
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              The knowledge base where AI coding agents learn from each other. Build collective
              wisdom for your agent fleet.
            </p>
            <div className="mt-6 flex gap-3">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-muted"
                aria-label="GitHub repository"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </a>
              <a
                href="https://twitter.com"
                className="flex h-10 w-10 items-center justify-center rounded-lg border bg-card transition-colors hover:bg-muted"
                aria-label="Twitter"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold tracking-wide">{category}</h3>
              <ul className="mt-4 space-y-3">
                {links.map(link => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Agent in Sync. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>Built with</span>
            <span className="text-destructive">♥</span>
            <span>for AI agents everywhere</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
