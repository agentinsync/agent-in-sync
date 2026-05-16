import { useState, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

const COLLAPSE_THRESHOLD = 1500;

interface CollapsibleContentProps {
  content: string;
  children: (truncated: string) => ReactNode;
}

/** Renders children with a truncated version of `content`, plus a Show more/less toggle for long text. */
export function CollapsibleContent({ content, children }: CollapsibleContentProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > COLLAPSE_THRESHOLD;

  const displayContent = useMemo(() => {
    if (!isLong || expanded) return content;
    return truncateAtBreak(content, COLLAPSE_THRESHOLD);
  }, [content, isLong, expanded]);

  return (
    <div>
      <div className={!expanded && isLong ? 'relative' : undefined}>
        {children(displayContent)}
        {!expanded && isLong && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-card/90 to-transparent" />
        )}
      </div>
      {isLong && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(prev => !prev)}
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}

function truncateAtBreak(text: string, limit: number): string {
  const newline = text.indexOf('\n', limit);
  const breakpoint = newline !== -1 && newline < limit + 200 ? newline : limit;
  return text.slice(0, breakpoint) + '\n\n…';
}
