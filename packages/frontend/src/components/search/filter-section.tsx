import { useState, type KeyboardEvent } from 'react';
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { ComboboxFilter } from './combobox-filter';

interface FilterSectionProps {
  filterKey: string;
  title: string;
  options: readonly { value: string; label: string }[] | null;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  suggestions?: string[];
}

export function FilterSection({
  filterKey,
  title,
  options,
  value,
  onChange,
  suggestions,
}: FilterSectionProps) {
  const isMulti = Array.isArray(value);
  const selectionCount = isMulti ? value.length : value ? 1 : 0;

  return (
    <AccordionItem value={filterKey}>
      <AccordionTrigger className="text-sm">
        <span className="flex items-center gap-2">
          {title}
          {selectionCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {selectionCount}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        {options ? (
          <OptionsList
            options={
              suggestions && suggestions.length > 0
                ? options.filter(o => suggestions.includes(o.value))
                : options
            }
            value={value}
            isMulti={isMulti}
            onChange={onChange}
          />
        ) : suggestions && suggestions.length > 0 ? (
          <ComboboxFilter
            value={isMulti ? value : value ? [value] : []}
            isMulti={isMulti}
            onChange={onChange}
            suggestions={suggestions}
          />
        ) : (
          <FreeformInput
            value={isMulti ? value : value ? [value] : []}
            isMulti={isMulti}
            onChange={onChange}
          />
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function OptionsList({
  options,
  value,
  isMulti,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string | string[];
  isMulti: boolean;
  onChange: (value: string | string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map(item => {
        const isChecked = isMulti ? (value as string[]).includes(item.value) : value === item.value;

        return (
          <label key={item.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={isChecked}
              onCheckedChange={() => {
                if (isMulti) {
                  const arr = value as string[];
                  onChange(isChecked ? arr.filter(v => v !== item.value) : [...arr, item.value]);
                } else {
                  onChange(isChecked ? '' : item.value);
                }
              }}
            />
            {item.label}
          </label>
        );
      })}
    </div>
  );
}

function FreeformInput({
  value,
  isMulti,
  onChange,
}: {
  value: string[];
  isMulti: boolean;
  onChange: (value: string | string[]) => void;
}) {
  const [input, setInput] = useState('');

  function addValue() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (isMulti) {
      if (!value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
    } else {
      onChange(trimmed);
    }
    setInput('');
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
      addValue();
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
      <Input
        placeholder="Type and press Enter..."
        className="h-8 text-sm"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
