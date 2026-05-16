import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './use-debounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('returns debounced value after delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'hello' },
    });

    // When: value changes
    rerender({ value: 'world' });
    // Then: still old value before timer
    expect(result.current).toBe('hello');

    // When: timer fires
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // Then: updated value
    expect(result.current).toBe('world');
  });

  it('resets timer on value change before delay expires', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Change again before timer fires
    rerender({ value: 'c' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // 'b' timer should have been cleared, 'c' timer not yet fired
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('c');
  });

  it('works with custom delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 1000), {
      initialProps: { value: 'start' },
    });

    rerender({ value: 'end' });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('start');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('end');
  });
});
