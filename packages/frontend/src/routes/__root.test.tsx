import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ScrollToTop } from './__root';

let mockPathname = '/initial';

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router');
  return {
    ...(actual as object),
    useLocation: () => ({ pathname: mockPathname }),
  };
});

describe('ScrollToTop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockPathname = '/initial';
  });

  it('calls window.scrollTo on mount', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mockPathname = '/dashboard';
    render(<ScrollToTop />);
    expect(spy).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('calls window.scrollTo again when pathname changes', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mockPathname = '/dashboard';
    const { rerender } = render(<ScrollToTop />);
    expect(spy).toHaveBeenCalledTimes(1);

    mockPathname = '/search';
    rerender(<ScrollToTop />);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not call window.scrollTo on re-render when pathname is unchanged', () => {
    const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mockPathname = '/dashboard';
    const { rerender } = render(<ScrollToTop />);
    expect(spy).toHaveBeenCalledTimes(1);

    rerender(<ScrollToTop />);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
