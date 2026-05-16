import { render, screen, act, waitFor } from '@/test-utils';
import { fireEvent } from '@testing-library/react';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  beforeEach(() => {
    // Replace the entire clipboard object with a mock
    const clipboardMock = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    Object.defineProperty(window.navigator, 'clipboard', {
      value: clipboardMock,
      writable: true,
      configurable: true,
    });
  });

  it('renders a button', () => {
    render(<CopyButton value="hello" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls navigator.clipboard.writeText on click', async () => {
    render(<CopyButton value="copy-me" />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy-me');
    });
  });

  it('shows check icon after copy then reverts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<CopyButton value="test" />);

    const button = screen.getByRole('button');

    // Before click: copy icon
    expect(button.querySelector('.lucide-copy')).toBeTruthy();

    // Click to copy
    await act(async () => {
      fireEvent.click(button);
    });

    // After click: check icon
    await waitFor(() => {
      expect(button.querySelector('.lucide-check')).toBeTruthy();
    });

    // After timeout: reverts to copy icon
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(button.querySelector('.lucide-copy')).toBeTruthy();
    });

    vi.useRealTimers();
  });
});
