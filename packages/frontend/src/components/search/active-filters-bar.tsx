import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { ActiveFilter, SearchPageParams } from '@/lib/search-params';

interface ActiveFiltersBarProps {
  filters: ActiveFilter[];
  onRemove: (key: keyof SearchPageParams, value: string) => void;
  onClearAll: () => void;
}

export function ActiveFiltersBar({ filters, onRemove, onClearAll }: ActiveFiltersBarProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map(filter => (
        <Badge key={`${filter.key}:${filter.value}`} variant="secondary" className="gap-1 py-1">
          {filter.label}
          <button
            type="button"
            onClick={() => onRemove(filter.key, filter.value)}
            className="ml-0.5 rounded-full hover:bg-muted"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
