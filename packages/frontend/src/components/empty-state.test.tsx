import { render, screen } from '@/test-utils';
import { EmptyState } from './empty-state';
import { Search } from 'lucide-react';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={Search} title="No results" description="Try a different query" />);

    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Try a different query')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        icon={Search}
        title="Empty"
        description="Nothing here"
        action={<button>Create</button>}
      />
    );

    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('does not render action div when no action', () => {
    const { container } = render(<EmptyState icon={Search} title="Empty" description="Nothing" />);

    // The action wrapper div should not exist — only 1 direct child div (the outer wrapper)
    const wrapper = container.firstElementChild!;
    const actionDiv = wrapper.querySelector(':scope > div.mt-4');
    expect(actionDiv).toBeNull();
  });
});
