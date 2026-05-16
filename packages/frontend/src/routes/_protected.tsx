import { Outlet, createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useSidebar } from '@/hooks/use-sidebar';
import { OrganizationProvider, useOrganization } from '@/hooks/use-organization';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Key,
  Search,
  Building2,
  Share2,
  Settings,
  User,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Plug,
  Zap,
  Bot,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Shield,
  ShieldCheck,
  HelpCircle,
  Flag,
  Globe,
  Users,
  ScrollText,
  ArrowLeft,
  BookOpen,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { searchParamsDefaults } from '@/lib/search-params';
import type { LucideIcon } from 'lucide-react';

export const Route = createFileRoute('/_protected')({
  component: ProtectedLayout,
});

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Main',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Search', href: '/search', icon: Search },
    ],
  },
  {
    label: 'Resources',
    items: [
      { name: 'Connect', href: '/connect', icon: Plug },
      { name: 'Agents', href: '/agents', icon: Bot },
      { name: 'Organizations', href: '/organizations', icon: Building2 },
      { name: 'Wiki', href: '/wiki-browse', icon: BookOpen },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'API Keys', href: '/api-keys', icon: Key },
      { name: 'Shares', href: '/share-requests', icon: Share2, roles: ['admin', 'reviewer'] },
      { name: 'Privacy', href: '/account', icon: Shield },
      { name: 'FAQ', href: '/help', icon: HelpCircle },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

function ProtectedLayout() {
  const { user, isLoading, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { expanded, pinned, togglePin, setHovered } = useSidebar();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const [headerQuery, setHeaderQuery] = useState('');
  const isOnSearch = location.pathname === '/search';

  useEffect(() => {
    if (isOnSearch) {
      const q = String((location.search as Record<string, unknown>).q ?? '');
      setHeaderQuery(q);
    }
  }, [isOnSearch, location.searchStr]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const q = headerQuery.trim();
    if (q.length > 0 && q.length < 3) return;
    if (isOnSearch) {
      const current = location.search as Record<string, unknown>;
      navigate({
        to: '/search',
        search: { ...searchParamsDefaults, ...current, q, page: 0 },
        replace: true,
      });
    } else {
      navigate({
        to: '/search',
        search: { ...searchParamsDefaults, q },
      });
    }
  }

  useEffect(() => {
    if (!isLoading && !user) {
      const intended = location.pathname + location.searchStr;
      if (intended !== '/login') {
        sessionStorage.setItem('auth_redirect', intended);
      }
      navigate({ to: '/login' });
    }
  }, [isLoading, user, navigate, location.pathname, location.searchStr]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70">
            <Zap className="h-6 w-6 text-white animate-pulse" />
          </div>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/2 animate-[slide_1s_ease-in-out_infinite] rounded-full bg-primary" />
          </div>
        </div>
      </div>
    );
  }

  const initials =
    user?.name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase() ||
    user?.email?.charAt(0).toUpperCase() ||
    '?';

  const themeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const ThemeIcon = themeIcon;
  const themeLabel = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';

  function cycleTheme() {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  }

  const exactMatchRoutes = ['/dashboard', '/super-admin'];

  function isActive(href: string) {
    return (
      location.pathname === href ||
      (!exactMatchRoutes.includes(href) && location.pathname.startsWith(href))
    );
  }

  const isSuperAdmin = Boolean((user as Record<string, unknown> | null)?.isSuperAdmin);
  const isAdminMode = isSuperAdmin && location.pathname.startsWith('/super-admin');

  return (
    <OrganizationProvider>
      <div className="min-h-screen bg-background">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Mobile sidebar drawer */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col border-r bg-card transition-transform duration-300 lg:hidden',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex h-16 items-center justify-between border-b px-5">
            {isAdminMode ? (
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg"
                  style={{ backgroundColor: 'hsl(152 65% 40%)' }}
                >
                  <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.15em]"
                    style={{ color: 'hsl(152 65% 40%)' }}
                  >
                    Platform Admin
                  </span>
                  <span className="text-sm font-semibold">Control Panel</span>
                </div>
              </div>
            ) : (
              <Link
                to="/"
                className="flex items-center gap-2.5 group"
                onClick={() => setSidebarOpen(false)}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/25 transition-transform group-hover:scale-105">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-semibold tracking-tight">
                  Agent <span className="text-primary">in Sync</span>
                </span>
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Beta
                </span>
              </Link>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-4">
            {!isAdminMode && <MobileOrgSelector />}
            {!isAdminMode && <div className="mb-2 h-px bg-border" />}
            <MobileNavItems
              isActive={isActive}
              onNavigate={() => setSidebarOpen(false)}
              isAdminMode={isAdminMode}
              isSuperAdmin={isSuperAdmin}
            />
          </nav>
          <div className="border-t p-4">
            <button
              onClick={cycleTheme}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ThemeIcon className="h-4 w-4" />
              {theme === 'light' ? 'Light Mode' : theme === 'dark' ? 'Dark Mode' : 'System'}
            </button>
          </div>
        </aside>

        {/* Desktop sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 hidden flex-col border-r lg:flex',
            'transition-[width,background-color,border-color] duration-200 ease-in-out'
          )}
          style={
            Object.assign(
              {
                width: expanded ? 'var(--sidebar-expanded)' : 'var(--sidebar-collapsed)',
                backgroundColor: 'var(--color-sidebar-bg)',
                borderColor: 'var(--color-sidebar-border)',
              },
              isAdminMode
                ? {
                    '--color-sidebar-active': 'hsl(152 65% 40%)',
                    '--color-sidebar-hover': 'var(--color-sidebar-hover)',
                  }
                : {}
            ) as React.CSSProperties
          }
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Top area */}
          <div
            className={cn(
              'flex h-14 shrink-0 items-center border-b px-2',
              expanded ? 'gap-2.5 pl-3' : 'justify-center'
            )}
            style={{ borderColor: 'var(--color-sidebar-border)' }}
          >
            <button
              onClick={togglePin}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors"
              style={{
                color: isAdminMode ? 'hsl(152 65% 55%)' : 'var(--color-sidebar-foreground)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '';
              }}
            >
              {isAdminMode ? <ShieldCheck className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {expanded && isAdminMode && (
              <div className="flex min-w-0 flex-col">
                <span
                  className="text-[9px] font-black uppercase tracking-[0.15em]"
                  style={{ color: 'hsl(152 65% 55%)' }}
                >
                  Platform Admin
                </span>
                <span className="text-[10px]" style={{ color: 'var(--color-sidebar-foreground)' }}>
                  Control Panel
                </span>
              </div>
            )}
          </div>

          {/* Navigation groups */}
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3">
            {isAdminMode ? (
              <AdminDesktopNav isActive={isActive} expanded={expanded} />
            ) : (
              <>
                <DesktopNavGroups isActive={isActive} expanded={expanded} />
                {isSuperAdmin && <EnterAdminButton expanded={expanded} />}
              </>
            )}
          </nav>

          {/* Bottom area */}
          <div
            className="border-t px-2 py-2 space-y-1"
            style={{ borderColor: 'var(--color-sidebar-border)' }}
          >
            {expanded ? (
              <>
                {isAdminMode && (
                  <>
                    <Link
                      to="/dashboard"
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors"
                      style={{ color: 'hsl(152 65% 55%)' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '';
                      }}
                    >
                      <ArrowLeft className="h-4 w-4 shrink-0" />
                      Exit Admin
                    </Link>
                    <div
                      className="my-0.5 h-px"
                      style={{ backgroundColor: 'var(--color-sidebar-border)' }}
                    />
                  </>
                )}
                <button
                  onClick={cycleTheme}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors"
                  style={{ color: 'var(--color-sidebar-foreground)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = '';
                  }}
                >
                  <ThemeIcon className="h-4 w-4 shrink-0" />
                  {themeLabel}
                </button>
                <button
                  onClick={togglePin}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors"
                  style={{ color: 'var(--color-sidebar-foreground)' }}
                  onMouseEnter={e => {
                    e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.backgroundColor = '';
                  }}
                >
                  {pinned ? (
                    <PanelLeftClose className="h-4 w-4 shrink-0" />
                  ) : (
                    <PanelLeftOpen className="h-4 w-4 shrink-0" />
                  )}
                  {pinned ? 'Collapse sidebar' : 'Pin sidebar'}
                </button>
                <div className="px-2 pt-1">
                  <span
                    className="text-[10px]"
                    style={{ color: 'var(--color-sidebar-foreground)', opacity: 0.4 }}
                  >
                    v{__APP_VERSION__}
                  </span>
                </div>
              </>
            ) : (
              <>
                {isAdminMode && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to="/dashboard"
                        className="flex w-full items-center justify-center rounded-md px-2 py-2 transition-colors"
                        style={{ color: 'hsl(152 65% 55%)' }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = '';
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Exit Admin</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={cycleTheme}
                      className="flex w-full items-center justify-center rounded-md px-2 py-2 transition-colors"
                      style={{ color: 'var(--color-sidebar-foreground)' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '';
                      }}
                    >
                      <ThemeIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Theme: {themeLabel}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={togglePin}
                      className="flex w-full items-center justify-center rounded-md px-2 py-2 transition-colors"
                      style={{ color: 'var(--color-sidebar-foreground)' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = '';
                      }}
                    >
                      <PanelLeftOpen className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Pin sidebar</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </aside>

        {/* Main content */}
        <div
          className={cn(
            'transition-[padding-left] duration-200 ease-in-out',
            expanded ? 'lg:pl-[var(--sidebar-expanded)]' : 'lg:pl-[var(--sidebar-collapsed)]'
          )}
        >
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl lg:px-6">
            {/* Mobile: hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Desktop: logo */}
            <Link to="/" className="hidden items-center gap-2 group lg:flex">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-sm transition-transform group-hover:scale-105">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight">
                Agent<span className="text-primary"> in Sync</span>
              </span>
              <span className="rounded-md bg-primary/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Beta
              </span>
            </Link>

            <div className="hidden flex-1 lg:block" />

            {/* Global search bar */}
            <div className="relative min-w-0 flex-[3]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Search issues..."
                className="h-9 w-full rounded-md border border-input bg-muted/40 pl-8 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:bg-background focus:ring-1 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
                value={headerQuery}
                onChange={e => setHeaderQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {headerQuery && (
                <button
                  onClick={() => {
                    setHeaderQuery('');
                    if (isOnSearch) {
                      const current = location.search as Record<string, unknown>;
                      navigate({
                        to: '/search',
                        search: { ...searchParamsDefaults, ...current, q: '', page: 0 },
                        replace: true,
                      });
                    }
                  }}
                  className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1" />

            {/* Organization selector (desktop only — mobile uses sidebar) */}
            <div className="hidden lg:block">
              <OrgSelector />
            </div>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9 border-2 border-primary/20">
                    <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? ''} />
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-sm font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.name || 'User'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <Link to="/account">
                  <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    Account
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem onClick={cycleTheme}>
                  <ThemeIcon className="mr-2 h-4 w-4" />
                  Theme: {themeLabel}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          {/* Page content */}
          <main className="p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </OrganizationProvider>
  );
}

function OrgSelector() {
  const { organizations, selectedOrg, selectOrg, isLoading } = useOrganization();

  if (isLoading || organizations.length <= 1) return null;

  return (
    <Select value={selectedOrg?.id ?? ''} onValueChange={selectOrg}>
      <SelectTrigger className="h-9 w-[160px]">
        <Building2 className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Organization" />
      </SelectTrigger>
      <SelectContent>
        {organizations.map(org => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const superAdminNavGroup: NavGroup = {
  label: 'Platform Admin',
  items: [
    { name: 'Platform', href: '/super-admin', icon: ShieldCheck },
    { name: 'Users', href: '/super-admin/users', icon: Users },
    { name: 'Organizations', href: '/super-admin/organizations', icon: Building2 },
    { name: 'Moderation', href: '/super-admin/moderation', icon: Flag },
    { name: 'Agents', href: '/super-admin/agents', icon: Bot },
    { name: 'Domains', href: '/super-admin/domains', icon: Globe },
    { name: 'Audit Log', href: '/super-admin/audit', icon: ScrollText },
  ],
};

function useFilteredNavGroups(): NavGroup[] {
  const { selectedOrg } = useOrganization();
  const role = selectedOrg?.role;

  const groups = navGroups;

  return groups
    .map(g => ({
      ...g,
      items: g.items.filter(item => !item.roles || (role && item.roles.includes(role))),
    }))
    .filter(g => g.items.length > 0);
}

function MobileNavItems({
  isActive,
  onNavigate,
  isAdminMode,
  isSuperAdmin,
}: {
  isActive: (href: string) => boolean;
  onNavigate: () => void;
  isAdminMode: boolean;
  isSuperAdmin: boolean;
}) {
  const filtered = useFilteredNavGroups();

  if (isAdminMode) {
    return (
      <>
        <Link
          to="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onNavigate}
        >
          <ArrowLeft className="h-4 w-4" />
          Exit Admin
        </Link>
        <div className="my-1 h-px bg-border" />
        {superAdminNavGroup.items.map(item => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                active ? 'text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              style={active ? { backgroundColor: 'hsl(152 65% 40%)' } : undefined}
              onClick={onNavigate}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </>
    );
  }

  const allItems = filtered.flatMap(g => g.items);
  return (
    <>
      {allItems.map(item => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.name}
            to={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
              active
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            onClick={onNavigate}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        );
      })}
      {isSuperAdmin && (
        <>
          <div className="my-1 h-px bg-border" />
          <Link
            to="/super-admin"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200"
            style={{ color: 'hsl(152 65% 40%)', backgroundColor: 'hsl(152 30% 10%)' }}
            onClick={onNavigate}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin Console
            <span className="ml-auto text-[9px] font-bold uppercase tracking-wider opacity-70">
              SA
            </span>
          </Link>
        </>
      )}
    </>
  );
}

function DesktopNavGroups({
  isActive,
  expanded,
}: {
  isActive: (href: string) => boolean;
  expanded: boolean;
}) {
  const filtered = useFilteredNavGroups();
  return (
    <>
      {filtered.map((group, gi) => (
        <div key={group.label}>
          {gi > 0 && (
            <div
              className="mx-2 my-2 h-px"
              style={{ backgroundColor: 'var(--color-sidebar-border)' }}
            />
          )}
          {expanded && (
            <p
              className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--color-sidebar-foreground)', opacity: 0.5 }}
            >
              {group.label}
            </p>
          )}
          {group.items.map(item => {
            const active = isActive(item.href);
            const linkContent = (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-all duration-150',
                  expanded ? '' : 'justify-center',
                  active ? 'text-white' : 'hover:text-white'
                )}
                style={{
                  backgroundColor: active ? 'var(--color-sidebar-active)' : undefined,
                  color: active ? 'white' : 'var(--color-sidebar-foreground)',
                }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  if (!active) e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  if (!active) e.currentTarget.style.backgroundColor = '';
                }}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {expanded && <span className="truncate">{item.name}</span>}
              </Link>
            );

            if (!expanded) {
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right">{item.name}</TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </div>
      ))}
    </>
  );
}

function AdminDesktopNav({
  isActive,
  expanded,
}: {
  isActive: (href: string) => boolean;
  expanded: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {superAdminNavGroup.items.map(item => {
        const active = isActive(item.href);
        const linkContent = (
          <Link
            key={item.name}
            to={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-all duration-150',
              expanded ? '' : 'justify-center'
            )}
            style={{
              backgroundColor: active ? 'var(--color-sidebar-active)' : undefined,
              color: active ? 'white' : 'var(--color-sidebar-foreground)',
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
              if (!active) e.currentTarget.style.backgroundColor = 'var(--color-sidebar-hover)';
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
              if (!active) e.currentTarget.style.backgroundColor = '';
            }}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {expanded && <span className="truncate">{item.name}</span>}
          </Link>
        );

        if (!expanded) {
          return (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
              <TooltipContent side="right">{item.name}</TooltipContent>
            </Tooltip>
          );
        }

        return linkContent;
      })}
    </div>
  );
}

function EnterAdminButton({ expanded }: { expanded: boolean }) {
  if (!expanded) {
    return (
      <div className="mt-2">
        <div
          className="mx-2 mb-2 h-px"
          style={{ backgroundColor: 'var(--color-sidebar-border)' }}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/super-admin"
              className="flex w-full items-center justify-center rounded-md px-2 py-2 transition-colors"
              style={{ color: 'hsl(152 65% 55%)', backgroundColor: 'hsl(152 30% 10%)' }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'hsl(152 30% 15%)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'hsl(152 30% 10%)';
              }}
            >
              <ShieldCheck className="h-4 w-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Admin Console</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="mx-2 mb-2 h-px" style={{ backgroundColor: 'var(--color-sidebar-border)' }} />
      <Link
        to="/super-admin"
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors"
        style={{ color: 'hsl(152 65% 55%)', backgroundColor: 'hsl(152 30% 10%)' }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'hsl(152 30% 15%)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'hsl(152 30% 10%)';
        }}
      >
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="truncate">Admin Console</span>
        <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider opacity-70">
          SA
        </span>
      </Link>
    </div>
  );
}

function MobileOrgSelector() {
  const { organizations, selectedOrg, selectOrg, isLoading } = useOrganization();

  if (isLoading || organizations.length === 0) return null;

  if (organizations.length === 1) {
    return (
      <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground">
        <Building2 className="h-4 w-4" />
        {organizations[0]?.name}
      </div>
    );
  }

  return (
    <div className="mb-2 px-1">
      <Select value={selectedOrg?.id ?? ''} onValueChange={selectOrg}>
        <SelectTrigger className="h-10 w-full">
          <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Organization" />
        </SelectTrigger>
        <SelectContent>
          {organizations.map(org => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
