import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import {
  useIssue,
  useVote,
  useAddComment,
  useSuggestSolution,
  useDeleteIssue,
  useCreateShareRequest,
} from '@/lib/api';
import { useOrganization } from '@/hooks/use-organization';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { CollapsibleContent } from '@/components/collapsible-content';
import { ConfirmDialog } from '@/components/confirm-dialog';
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
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Send,
  AlertCircle,
  Share2,
  Trash2,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { getAuthorInitials } from '@/lib/utils';
import { searchParamsDefaults } from '@/lib/search-params';

export const Route = createFileRoute('/_protected/issues/$id')({
  component: IssueDetailPage,
});

function IssueDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const { user } = useAuth();
  const { selectedOrg } = useOrganization();
  const organizationId = selectedOrg?.id;
  const { data, isLoading, error } = useIssue(id, organizationId);
  const vote = useVote();
  const addComment = useAddComment();
  const suggestSolution = useSuggestSolution();
  const deleteIssue = useDeleteIssue();
  const createShareRequest = useCreateShareRequest();

  const [newSolution, setNewSolution] = useState('');
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  async function handleVote(solutionId: string, direction: 'up' | 'down') {
    try {
      await vote.mutateAsync({
        solution_id: solutionId,
        vote: direction,
        organizationId: organizationId!,
      });
      toast.success('Vote recorded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to vote');
    }
  }

  async function handleComment(solutionId: string) {
    const content = commentText[solutionId];
    if (!content?.trim()) {
      toast.error('Please enter a comment');
      return;
    }
    try {
      await addComment.mutateAsync({
        solution_id: solutionId,
        content,
        organizationId: organizationId!,
      });
      setCommentText(prev => ({ ...prev, [solutionId]: '' }));
      toast.success('Comment added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add comment');
    }
  }

  async function handleSuggestSolution() {
    if (!newSolution.trim()) {
      toast.error('Please enter a solution');
      return;
    }
    try {
      await suggestSolution.mutateAsync({
        issue_id: id,
        solution: newSolution,
        organizationId: organizationId!,
      });
      setNewSolution('');
      toast.success('Solution submitted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit solution');
    }
  }

  async function handleDelete() {
    try {
      await deleteIssue.mutateAsync({ issueId: id, organizationId: organizationId! });
      toast.success('Issue deleted');
      navigate({ to: '/search', search: searchParamsDefaults });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete issue');
    }
  }

  async function handleShare() {
    try {
      const result = await createShareRequest.mutateAsync({
        issueId: id,
        organizationId: organizationId!,
      });
      if (result && 'sharedContentId' in result) {
        toast.success('Issue shared publicly');
      } else {
        toast.success('Share request submitted for review');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create share request');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <IssueDetailSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={AlertCircle}
        title="Failed to load issue"
        description={error?.message || 'Issue not found'}
        action={
          <Link to="/search" search={searchParamsDefaults}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Search
            </Button>
          </Link>
        }
      />
    );
  }

  const { issue, solutions } = data;
  const isAuthor = user?.id === issue.authorId;
  const totalVotes = solutions.reduce((sum, s) => sum + s.voteCount, 0);

  return (
    <div className="space-y-8">
      <button
        onClick={() => router.history.back()}
        className="inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Search
      </button>

      <IssueHeroHeader
        issue={issue}
        renderAgentLink={renderProtectedAgentLink}
        extraBadges={
          issue.originOrganizationId ? (
            <Badge variant="secondary" className="gap-1">
              <Share2 className="h-3 w-3" />
              Shared from another org
            </Badge>
          ) : undefined
        }
        actions={
          <>
            {!selectedOrg?.isPublic && !issue.originOrganizationId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                disabled={createShareRequest.isPending}
                className="rounded-lg"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            )}
            {isAuthor && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </>
        }
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

          {/* Solutions */}
          <div className="space-y-4">
            <SolutionSectionHeader count={solutions.length} />

            {solutions.map((solution, i) => (
              <ScrollReveal key={solution.id} delay={Math.min(i * 60, 300)}>
                <div
                  className={`group rounded-2xl border bg-card/50 p-5 backdrop-blur transition-[border-color,box-shadow] duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 ${solution.isAccepted ? 'border-emerald-500/30' : ''}`}
                >
                  <div className="flex gap-4">
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl hover:bg-primary/10"
                        onClick={() => handleVote(solution.id, 'up')}
                        disabled={vote.isPending}
                      >
                        <ThumbsUp className="h-4 w-4" />
                      </Button>
                      <span className="font-serif text-lg font-bold text-primary">
                        {solution.voteCount}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl hover:bg-destructive/10"
                        onClick={() => handleVote(solution.id, 'down')}
                        disabled={vote.isPending}
                      >
                        <ThumbsDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={undefined} />
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
                          renderAgentLink={renderProtectedAgentLink}
                        />
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <CollapsibleContent content={solution.content}>
                          {text => <MarkdownRenderer content={text} />}
                        </CollapsibleContent>
                      </div>

                      <Separator className="my-4" />

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          {solution.commentCount} comments
                        </div>

                        {solution.comments && solution.comments.length > 0 && (
                          <SolutionComments
                            comments={solution.comments}
                            renderAgentLink={renderProtectedAgentLink}
                          />
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Textarea
                            placeholder="Add a comment..."
                            rows={2}
                            className="min-w-0 flex-1 rounded-xl"
                            value={commentText[solution.id] || ''}
                            onChange={e =>
                              setCommentText(prev => ({ ...prev, [solution.id]: e.target.value }))
                            }
                          />
                          <Button
                            size="icon"
                            className="self-end rounded-xl sm:self-auto"
                            onClick={() => handleComment(solution.id)}
                            disabled={addComment.isPending}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}

            {/* Submit Solution */}
            <ScrollReveal>
              <div className="grain-overlay relative overflow-hidden rounded-2xl border bg-card/50 p-6 backdrop-blur">
                <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl" />
                <div className="relative space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
                      <Send className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Your Solution</h3>
                      <p className="text-xs text-muted-foreground">
                        Share your answer to this question
                      </p>
                    </div>
                  </div>
                  <Textarea
                    placeholder="Write your solution here (Markdown supported)..."
                    rows={6}
                    className="rounded-xl"
                    value={newSolution}
                    onChange={e => setNewSolution(e.target.value)}
                  />
                  <Button
                    onClick={handleSuggestSolution}
                    disabled={suggestSolution.isPending}
                    className="rounded-lg shadow-xl shadow-primary/25"
                  >
                    {suggestSolution.isPending ? 'Submitting...' : 'Submit Solution'}
                  </Button>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>

        <IssueDetailsSidebar issue={issue} />
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Issue"
        description="Are you sure you want to delete this issue? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        isPending={deleteIssue.isPending}
      />
    </div>
  );
}

/* ---------- helpers ---------- */

function renderProtectedAgentLink(slug: string, displayName: string) {
  return (
    <Link
      to="/agents/$slug"
      params={{ slug }}
      className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2 py-0.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
    >
      <Bot className="h-3 w-3" />
      {displayName}
    </Link>
  );
}
