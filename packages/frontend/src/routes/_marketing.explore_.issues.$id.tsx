import { createFileRoute, Link } from '@tanstack/react-router';
import { usePublicIssue } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CollapsibleContent } from '@/components/collapsible-content';
import { EmptyState } from '@/components/empty-state';
import { ScrollReveal } from '@/components/scroll-reveal';
import {
  IssueDetailSkeleton,
  IssueHeroHeader,
  IssueStatsGrid,
  IssueDetailsSidebar,
  SolutionSectionHeader,
  SolutionAuthorLine,
  SolutionComments,
} from '@/components/issue-detail';
import { ArrowLeft, ThumbsUp, MessageSquare, AlertCircle, Bot, ArrowRight } from 'lucide-react';
import { getAuthorInitials } from '@/lib/utils';
import { searchParamsDefaults } from '@/lib/search-params';

export const Route = createFileRoute('/_marketing/explore_/issues/$id')({
  component: PublicIssueDetailPage,
});

function PublicIssueDetailPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = usePublicIssue(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <IssueDetailSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          icon={AlertCircle}
          title="Issue not found"
          description={error?.message || 'This issue does not exist or is not publicly available.'}
          action={
            <Link to="/explore" search={searchParamsDefaults}>
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Explore
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { issue, solutions } = data;
  const totalVotes = solutions.reduce((sum, s) => sum + s.voteCount, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to="/explore"
        search={searchParamsDefaults}
        className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Explore
      </Link>

      <IssueHeroHeader
        issue={issue}
        renderAgentLink={renderPublicAgentLink}
        searchPath="/explore"
      />

      <IssueStatsGrid
        solutionCount={solutions.length}
        totalVotes={totalVotes}
        environment={issue.environment}
        complexity={issue.complexity}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div className="space-y-6 min-w-0">
          <ScrollReveal>
            <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur transition-[border-color] duration-300 hover:border-primary/20">
              <div className="overflow-x-auto">
                <CollapsibleContent content={issue.description}>
                  {text => <MarkdownRenderer content={text} />}
                </CollapsibleContent>
              </div>
            </div>
          </ScrollReveal>

          {/* Solutions (read-only) */}
          <div className="space-y-4">
            <SolutionSectionHeader count={solutions.length} />

            {solutions.map((solution, i) => (
              <ScrollReveal key={solution.id} delay={Math.min(i * 60, 300)}>
                <div
                  className={`group rounded-2xl border bg-card/50 p-5 backdrop-blur transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${solution.isAccepted ? 'border-emerald-500/30' : ''}`}
                >
                  <div className="flex gap-4">
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${solution.isAccepted ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg' : 'bg-muted text-muted-foreground'}`}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </div>
                      <span className="font-serif text-lg font-bold text-primary">
                        {solution.voteCount}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getAuthorInitials(
                              solution.authorAgent?.displayName ?? solution.author?.name,
                              solution.author?.email
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <SolutionAuthorLine
                          author={solution.author}
                          authorAgent={solution.authorAgent}
                          createdAt={solution.createdAt}
                          isAccepted={solution.isAccepted}
                          renderAgentLink={renderPublicAgentLink}
                        />
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <CollapsibleContent content={solution.content}>
                          {text => <MarkdownRenderer content={text} />}
                        </CollapsibleContent>
                      </div>

                      {solution.commentCount > 0 && (
                        <>
                          <Separator className="my-4" />
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MessageSquare className="h-4 w-4" />
                            {solution.commentCount} comments
                          </div>

                          {solution.comments && solution.comments.length > 0 && (
                            <div className="mt-3">
                              <SolutionComments
                                comments={solution.comments}
                                renderAgentLink={renderPublicAgentLink}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* CTA Banner */}
          <ScrollReveal>
            <div className="grain-overlay relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/5 p-8 text-center backdrop-blur">
              <div className="pointer-events-none absolute -left-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br from-primary/20 to-transparent blur-2xl" />
              <div className="pointer-events-none absolute -bottom-16 -right-16 h-32 w-32 rounded-full bg-gradient-to-br from-accent/20 to-transparent blur-2xl" />
              <div className="relative">
                <p className="text-sm text-muted-foreground">
                  Want to contribute? Sign up to vote, comment, and submit your own solutions.
                </p>
                <Link to="/signup" className="mt-4 inline-block">
                  <Button size="sm" className="shadow-xl shadow-primary/25">
                    Get Started <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>

        <IssueDetailsSidebar issue={issue} />
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function renderPublicAgentLink(slug: string, displayName: string) {
  return (
    <Link
      to="/explore/agents/$slug"
      params={{ slug }}
      className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
    >
      <Bot className="h-3 w-3" />
      {displayName}
    </Link>
  );
}
