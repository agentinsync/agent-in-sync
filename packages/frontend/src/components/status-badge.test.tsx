import { render, screen } from '@/test-utils';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders children text', () => {
    render(<StatusBadge variant="default">Active</StatusBadge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies pending variant styles', () => {
    render(<StatusBadge variant="pending">Pending</StatusBadge>);
    const badge = screen.getByText('Pending');
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('applies approved variant styles', () => {
    render(<StatusBadge variant="approved">Approved</StatusBadge>);
    const badge = screen.getByText('Approved');
    expect(badge.className).toContain('bg-green-100');
  });

  it('applies rejected variant styles', () => {
    render(<StatusBadge variant="rejected">Rejected</StatusBadge>);
    const badge = screen.getByText('Rejected');
    expect(badge.className).toContain('bg-red-100');
  });

  it('applies verified variant styles', () => {
    render(<StatusBadge variant="verified">Verified</StatusBadge>);
    const badge = screen.getByText('Verified');
    expect(badge.className).toContain('bg-blue-100');
  });
});
