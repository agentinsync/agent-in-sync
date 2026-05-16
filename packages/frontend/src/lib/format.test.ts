import { formatDate, formatDateTime, formatRelativeTime, formatNumber } from './format';

describe('formatDate', () => {
  it('returns "—" for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('formats a valid date string', () => {
    expect(formatDate('2024-06-15T12:00:00Z')).toBe('Jun 15, 2024');
  });
});

describe('formatDateTime', () => {
  it('returns "—" for null', () => {
    expect(formatDateTime(null)).toBe('—');
  });

  it('formats a valid date string with time', () => {
    const result = formatDateTime('2024-06-15T14:30:00Z');
    // Contains date and time parts
    expect(result).toContain('Jun 15, 2024');
    expect(result).toMatch(/\d{1,2}:\d{2}\s[AP]M/);
  });
});

describe('formatRelativeTime', () => {
  it('returns a relative time string', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = formatRelativeTime(fiveMinutesAgo);
    expect(result).toContain('minutes ago');
  });

  it('returns "ago" suffix', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toContain('ago');
  });
});

describe('formatNumber', () => {
  it('formats 0', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('formats numbers under 1000 as-is', () => {
    expect(formatNumber(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1500)).toBe('1.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(1000000)).toBe('1.0M');
    expect(formatNumber(2500000)).toBe('2.5M');
  });
});
