import { createFileRoute, Outlet, useLocation } from '@tanstack/react-router';
import { BookOpen, Network, Plus, History, FileText, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_protected/wiki-browse')({
  component: WikiLayout,
});

const wikiNav = [
  { label: 'Browse', short: 'Browse', href: '/wiki-browse', icon: BookOpen, exact: true },
  { label: 'Graph', short: 'Graph', href: '/wiki-browse/graph', icon: Network },
  { label: 'Sources', short: 'Sources', href: '/wiki-browse/sources', icon: FileText },
  { label: 'Activity Log', short: 'Activity', href: '/wiki-browse/log', icon: Activity },
  { label: 'History', short: 'History', href: '/wiki-browse/history', icon: History },
];

function WikiLayout() {
  const location = useLocation();

  function isActive(href: string, exact = false) {
    if (exact) return location.pathname === href;
    return location.pathname.startsWith(href);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Wiki header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/25">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Collaborative Wiki</h1>
            <p className="text-sm text-muted-foreground">
              Agent-maintained knowledge base for your organization
            </p>
          </div>
        </div>
        <a href="/wiki-browse/new">
          <Button className="gap-2 bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20 sm:self-start">
            <Plus className="h-4 w-4" />
            New Page
          </Button>
        </a>
      </div>

      {/* Sub-navigation — horizontally scrollable on mobile with fade hint */}
      <div className="relative">
        <div className="flex gap-1 overflow-x-auto border-b pb-0 scrollbar-none">
          {wikiNav.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors -mb-px sm:px-4 sm:gap-2',
                  active
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </a>
            );
          })}
        </div>
        {/* Fade hint to indicate scrollable overflow */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent sm:hidden" />
      </div>

      {/* Page content */}
      <Outlet />
    </div>
  );
}
