import { render, screen } from '@/test-utils';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './confirm-dialog';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Delete item?',
  description: 'This action cannot be undone.',
  onConfirm: vi.fn(),
};

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, description, and buttons when open', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Delete item?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);

    await user.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onOpenChange(false) when cancel button clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows "Loading..." when isPending', () => {
    render(<ConfirmDialog {...defaultProps} isPending />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('disables buttons when isPending', () => {
    render(<ConfirmDialog {...defaultProps} isPending />);
    expect(screen.getByText('Loading...')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('uses custom confirmLabel and cancelLabel', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Yes, delete" cancelLabel="No, keep" />);
    expect(screen.getByText('Yes, delete')).toBeInTheDocument();
    expect(screen.getByText('No, keep')).toBeInTheDocument();
  });
});
