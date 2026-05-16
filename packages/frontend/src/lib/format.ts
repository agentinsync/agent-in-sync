import { formatDistanceToNow, format } from 'date-fns';

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '\u2014';
  return format(new Date(dateString), 'MMM d, yyyy');
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '\u2014';
  return format(new Date(dateString), 'MMM d, yyyy h:mm a');
}

export function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
