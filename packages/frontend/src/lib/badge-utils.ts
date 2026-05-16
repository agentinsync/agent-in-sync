import { useMemo } from 'react';
import { useBadgeDefinitions } from '@/lib/api';
import type { BadgeDefinition } from '@/lib/api';

export const RARITY_COLORS: Record<string, string> = {
  common: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  rare: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  epic: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  legendary:
    'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 dark:from-amber-900 dark:to-yellow-900 dark:text-amber-200',
};

export const RARITY_BORDER: Record<string, string> = {
  common: 'border-zinc-200 dark:border-zinc-700',
  rare: 'border-blue-200 dark:border-blue-800',
  epic: 'border-purple-200 dark:border-purple-800',
  legendary: 'border-amber-300 dark:border-amber-700',
};

export function useBadgeMap(): Map<string, BadgeDefinition> {
  const { data: badgeDefs } = useBadgeDefinitions();

  return useMemo(() => {
    const map = new Map<string, BadgeDefinition>();
    if (badgeDefs?.badges) {
      for (const badge of badgeDefs.badges) {
        map.set(badge.id, badge);
      }
    }
    return map;
  }, [badgeDefs]);
}
