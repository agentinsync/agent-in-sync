import { render, screen } from '@/test-utils';
import { SolutionComments, type CommentData } from './issue-detail';

function makeComment(overrides: Partial<CommentData> = {}): CommentData {
  return {
    id: 'c1',
    content: 'Great solution!',
    createdAt: new Date().toISOString(),
    author: { name: 'Alice', email: 'alice@test.com' },
    authorAgent: null,
    ...overrides,
  };
}

describe('SolutionComments', () => {
  it('renders nothing when comments list is empty', () => {
    const { container } = render(<SolutionComments comments={[]} />);
    expect(container.firstElementChild).toBeNull();
  });

  it('renders comment content and author name', () => {
    const comments = [makeComment({ id: 'c1', content: 'Looks good', author: { name: 'Bob' } })];

    render(<SolutionComments comments={comments} />);

    expect(screen.getByText('Looks good')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders multiple comments', () => {
    const comments = [
      makeComment({ id: 'c1', content: 'First comment', author: { name: 'Alice' } }),
      makeComment({ id: 'c2', content: 'Second comment', author: { name: 'Bob' } }),
      makeComment({ id: 'c3', content: 'Third comment', author: { name: 'Carol' } }),
    ];

    render(<SolutionComments comments={comments} />);

    expect(screen.getByText('First comment')).toBeInTheDocument();
    expect(screen.getByText('Second comment')).toBeInTheDocument();
    expect(screen.getByText('Third comment')).toBeInTheDocument();
  });

  it('shows "Unknown" when author name is null and no agent', () => {
    const comments = [makeComment({ author: { name: null }, authorAgent: null })];

    render(<SolutionComments comments={comments} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders agent display name via renderAgentLink when agent is present', () => {
    const comments = [
      makeComment({
        authorAgent: { slug: 'bot-1', displayName: 'MyBot' },
      }),
    ];

    const renderAgentLink = (slug: string, displayName: string) => (
      <span data-testid="agent-link">
        @{slug} ({displayName})
      </span>
    );

    render(<SolutionComments comments={comments} renderAgentLink={renderAgentLink} />);

    const link = screen.getByTestId('agent-link');
    expect(link).toHaveTextContent('@bot-1 (MyBot)');
  });

  it('falls back to author name when agent is present but no renderAgentLink', () => {
    const comments = [
      makeComment({
        author: { name: 'Human Author' },
        authorAgent: { slug: 'bot-1', displayName: 'MyBot' },
      }),
    ];

    render(<SolutionComments comments={comments} />);

    expect(screen.getByText('Human Author')).toBeInTheDocument();
  });

  it('renders author initials in avatar', () => {
    const comments = [makeComment({ author: { name: 'John Doe' } })];

    render(<SolutionComments comments={comments} />);

    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders email initial when name is null', () => {
    const comments = [makeComment({ author: { name: null, email: 'zara@test.com' } })];

    render(<SolutionComments comments={comments} />);

    expect(screen.getByText('Z')).toBeInTheDocument();
  });
});
