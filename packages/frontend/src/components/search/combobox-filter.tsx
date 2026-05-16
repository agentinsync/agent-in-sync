import { useState, useRef, type KeyboardEvent } from 'react';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComboboxFilterProps {
  value: string[];
  isMulti: boolean;
  onChange: (value: string | string[]) => void;
  suggestions: string[];
  placeholder?: string;
}

export function ComboboxFilter({
  value,
  isMulti,
  onChange,
  suggestions,
  placeholder = 'Type to search or add...',
}: ComboboxFilterProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = input
    ? suggestions.filter(s => s.toLowerCase().includes(input.toLowerCase())).slice(0, 20)
    : suggestions.slice(0, 8);

  const showFreeformRow =
    input.trim() && !filtered.some(s => s.toLowerCase() === input.toLowerCase().trim());

  function selectSuggestion(suggestion: string) {
    if (isMulti) {
      if (!value.includes(suggestion)) {
        onChange([...value, suggestion]);
      }
      setInput('');
      inputRef.current?.focus();
    } else {
      onChange(suggestion);
      setInput('');
      setOpen(false);
    }
  }

  function addFreeform() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (isMulti) {
      if (!value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInput('');
      inputRef.current?.focus();
    } else {
      onChange(trimmed);
      setInput('');
      setOpen(false);
    }
  }

  function removeValue(v: string) {
    if (isMulti) {
      onChange(value.filter(item => item !== v));
    } else {
      onChange('');
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered.length > 0) {
        selectSuggestion(filtered[0]!);
      } else {
        addFreeform();
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map(v => (
            <Badge key={v} variant="secondary" className="gap-1 text-xs">
              {v}
              <button
                type="button"
                onClick={() => removeValue(v)}
                className="ml-0.5 rounded-full hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
            placeholder={placeholder}
            className="h-8 text-sm"
            value={input}
            onFocus={() => setOpen(true)}
            onChange={e => {
              setInput(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </PopoverAnchor>
        {(filtered.length > 0 || showFreeformRow) && (
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
            onOpenAutoFocus={e => e.preventDefault()}
          >
            <ScrollArea className="max-h-48">
              <div className="py-1">
                {filtered.map(s => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      selectSuggestion(s);
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                      value.includes(s) && 'font-medium text-primary'
                    )}
                  >
                    {s}
                  </button>
                ))}
                {showFreeformRow && (
                  <button
                    type="button"
                    onMouseDown={e => {
                      e.preventDefault();
                      addFreeform();
                    }}
                    className="flex w-full cursor-pointer items-center px-3 py-1.5 text-sm italic text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    Add &quot;{input.trim()}&quot;
                  </button>
                )}
              </div>
            </ScrollArea>
          </PopoverContent>
        )}
      </Popover>
    </div>
  );
}
