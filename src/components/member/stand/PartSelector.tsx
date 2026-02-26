'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown, Music2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PartOption {
  id: string;
  label: string;
  /** Proxy URL (already includes ?eventId= if needed) */
  url: string;
  pageCount: number;
}

interface PartSelectorProps {
  /** Full-score option(s) */
  fullScore: PartOption | null;
  /** Individual part options */
  parts: PartOption[];
  /** Currently active option id */
  activeId: string | null;
  /** Called when user picks a part */
  onChange: (option: PartOption) => void;
  className?: string;
}

export function PartSelector({
  fullScore,
  parts,
  activeId,
  onChange,
  className,
}: PartSelectorProps) {
  const [open, setOpen] = useState(false);

  const allOptions: PartOption[] = [
    ...(fullScore ? [fullScore] : []),
    ...parts,
  ];

  const active = allOptions.find((o) => o.id === activeId) ?? allOptions[0] ?? null;

  if (allOptions.length <= 1) {
    // Nothing to choose — render nothing
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', className)}
          aria-label="Select part"
        >
          <Music2 className="h-3.5 w-3.5" />
          <span className="max-w-28 truncate text-xs">
            {active?.label ?? 'Select Part'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end">
        <div className="space-y-0.5">
          {allOptions.map((option) => (
            <button
              key={option.id}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent',
                activeId === option.id && 'font-medium'
              )}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <Check
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-primary',
                  activeId !== option.id && 'invisible'
                )}
              />
              <span className="flex-1 truncate text-left">{option.label}</span>
              {option.pageCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {option.pageCount}p
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

PartSelector.displayName = 'PartSelector';
