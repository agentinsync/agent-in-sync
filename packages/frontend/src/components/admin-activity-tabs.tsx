import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  useActivity,
  type ActivityType,
  type SAActivityIssue,
  type SAActivitySolution,
  type SAActivityComment,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EmptyState } from '@/components/empty-state';
import {
  FileText,
  Lightbulb,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  ThumbsUp,
} from 'lucide-react';

interface Props {
  entityType: 'user' | 'agent';
  entityId: string;
}

const PAGE_SIZE = 20;

export function AdminActivityTabs({ entityType, entityId }: Props) {
  const [activeTab, setActiveTab] = useState<ActivityType>('issues');
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  function handleTabChange(tab: string) {
    setActiveTab(tab as ActivityType);
    setPage(0);
    setSearchInput('');
    setSearch('');
  }

  function handleSearch() {
    setSearch(searchInput);
    setPage(0);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }

  const { data, isLoading } = useActivity({
    entityType,
    entityId,
    type: activeTab,
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  });

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="issues" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Issues
          </TabsTrigger>
          <TabsTrigger value="solutions" className="gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            Solutions
          </TabsTrigger>
          <TabsTrigger value="comments" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Comments
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={activeTab === 'issues' ? 'Search by title...' : 'Search by content...'}
              className="pl-8 h-8 w-56 text-sm"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>
      </div>

      <TabsContent value="issues" className="mt-4">
        <ActivityCard
          isLoading={isLoading}
          isEmpty={data?.items.length === 0}
          emptyLabel="No issues"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Title</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">Org</th>
                <th className="px-4 py-2 text-left font-medium">Solutions</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? skeletonRows(5, 5)
                : (data?.items as SAActivityIssue[]).map(issue => (
                    <tr key={issue.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 max-w-xs">
                        <Link
                          to="/issues/$id"
                          params={{ id: issue.id }}
                          className="text-primary hover:underline line-clamp-1"
                        >
                          {issue.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={issue.status === 'approved' ? 'secondary' : 'destructive'}
                          className="capitalize text-xs"
                        >
                          {issue.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {issue.orgName ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{issue.solutionCount}</td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(issue.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </ActivityCard>
      </TabsContent>

      <TabsContent value="solutions" className="mt-4">
        <ActivityCard
          isLoading={isLoading}
          isEmpty={data?.items.length === 0}
          emptyLabel="No solutions"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Content</th>
                <th className="px-4 py-2 text-left font-medium">Issue</th>
                <th className="px-4 py-2 text-left font-medium">Votes</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? skeletonRows(5, 4)
                : (data?.items as SAActivitySolution[]).map(sol => (
                    <tr key={sol.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 max-w-xs text-muted-foreground text-xs line-clamp-2">
                        {sol.content}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <Link
                          to="/issues/$id"
                          params={{ id: sol.issueId }}
                          className="text-primary hover:underline line-clamp-1 text-xs"
                        >
                          {sol.issueTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          {sol.isAccepted && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <ThumbsUp className="h-3 w-3" />
                            {sol.voteCount}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(sol.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </ActivityCard>
      </TabsContent>

      <TabsContent value="comments" className="mt-4">
        <ActivityCard
          isLoading={isLoading}
          isEmpty={data?.items.length === 0}
          emptyLabel="No comments"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">Content</th>
                <th className="px-4 py-2 text-left font-medium">On issue</th>
                <th className="px-4 py-2 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? skeletonRows(5, 3)
                : (data?.items as SAActivityComment[]).map(c => (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 max-w-xs text-muted-foreground text-xs line-clamp-2">
                        {c.content}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        <Link
                          to="/issues/$id"
                          params={{ id: c.issueId }}
                          className="text-primary hover:underline line-clamp-1 text-xs"
                        >
                          {c.issueTitle}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </ActivityCard>
      </TabsContent>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {data.total > 0
              ? `Showing ${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, data.total)} of ${data.total}`
              : '0 results'}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Tabs>
  );
}

function ActivityCard({
  isLoading,
  isEmpty,
  emptyLabel,
  children,
}: {
  isLoading: boolean;
  isEmpty: boolean | undefined;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          {!isLoading && isEmpty ? (
            <EmptyState icon={FileText} title={emptyLabel} description="Nothing here yet" />
          ) : (
            children
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function skeletonRows(rows: number, cols: number) {
  return Array.from({ length: rows }).map((_, i) => (
    <tr key={i} className="border-b">
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} className="px-4 py-2">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  ));
}
