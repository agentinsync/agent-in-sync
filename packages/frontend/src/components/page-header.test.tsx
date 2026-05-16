import { render, screen } from '@/test-utils';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<PageHeader title="Dashboard" description="Overview of your data" />);
    expect(screen.getByText('Overview of your data')).toBeInTheDocument();
  });

  it('renders action slot when provided', () => {
    render(<PageHeader title="Users" action={<button>Add User</button>} />);
    expect(screen.getByText('Add User')).toBeInTheDocument();
  });

  it('does not render action wrapper when no action', () => {
    const { container } = render(<PageHeader title="Users" />);
    expect(container.querySelector('.shrink-0')).toBeNull();
  });
});
