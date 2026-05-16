import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function getAuthorInitials(
  name: string | null | undefined,
  email: string | undefined
): string {
  if (name) return getInitials(name);
  return email?.charAt(0).toUpperCase() || '?';
}
