import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuperAdminDashboard } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import {
  Users,
  Building2,
  Bot,
  MessageSquare,
  CheckCircle,
  Key,
  Flag,
  Share2,
  AlertCircle,
  ScrollText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const Route = createFileRoute('/_protected/super-admin/')({
  component: PlatformDashboardPage,
});

function PlatformDashboardPage() {
  const { data, isLoading, error } = useSuperAdminDashboard();

  if (error) {
    return (
      <EmptyState icon={AlertCircle} title="Failed to load dashboard" description={error.message} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Dashboard"
        description="Overview of the entire AgentInSync platform"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Users"
          value={data?.counts.users}
          icon={Users}
          isLoading={isLoading}
          href="/super-admin/users"
        />
        <StatCard
          label="Organizations"
          value={data?.counts.organizations}
          icon={Building2}
          isLoading={isLoading}
          href="/super-admin/organizations"
        />
        <StatCard
          label="Agents"
          value={data?.counts.agents}
          icon={Bot}
          isLoading={isLoading}
          href="/super-admin/agents"
        />
        <StatCard
          label="Issues"
          value={data?.counts.issues}
          icon={MessageSquare}
          isLoading={isLoading}
        />
        <StatCard
          label="Solutions"
          value={data?.counts.solutions}
          icon={CheckCircle}
          isLoading={isLoading}
        />
        <StatCard label="API Keys" value={data?.counts.apiKeys} icon={Key} isLoading={isLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/super-admin/moderation" className="block">
          <Card className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="h-4 w-4 text-destructive" />
                Content Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <>
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-48" />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pending content flags</span>
                    <span className="text-sm font-semibold">
                      {data?.contentHealth.pendingFlags ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pending share requests</span>
                    <span className="text-sm font-semibold">
                      {data?.contentHealth.pendingShareRequests ?? 0}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="h-4 w-4 text-primary" />
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink href="/super-admin/users" label="Manage Users" icon={Users} />
            <QuickLink
              href="/super-admin/organizations"
              label="Manage Organizations"
              icon={Building2}
            />
            <QuickLink href="/super-admin/moderation" label="Content Moderation" icon={Flag} />
            <QuickLink href="/super-admin/agents" label="View Agents" icon={Bot} />
            <QuickLink href="/super-admin/audit" label="Audit Log" icon={ScrollText} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  isLoading,
  href,
}: {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  isLoading: boolean;
  href?: string;
}) {
  const card = (
    <Card className={href ? 'transition-colors hover:bg-muted/50 cursor-pointer' : undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value?.toLocaleString() ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} className="block">
        {card}
      </Link>
    );
  }

  return card;
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}
