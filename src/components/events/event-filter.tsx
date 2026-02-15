'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Filter, X } from 'lucide-react';
import { formatDate } from '@/lib/date';

export interface EventFilterState {
  types: string[];
  dateRange: { start: Date | undefined; end: Date | undefined };
  status: 'all' | 'upcoming' | 'past';
}

interface EventFilterProps {
  filters: EventFilterState;
  onFiltersChange: (filters: EventFilterState) => void;
  className?: string;
  showStatusFilter?: boolean;
}

const EVENT_TYPES = [
  { value: 'CONCERT', label: 'Concert', color: 'bg-primary' },
  { value: 'REHEARSAL', label: 'Rehearsal', color: 'bg-blue-500' },
  { value: 'SECTIONAL', label: 'Sectional', color: 'bg-purple-500' },
  { value: 'BOARD_MEETING', label: 'Board Meeting', color: 'bg-amber-500' },
  { value: 'SOCIAL', label: 'Social', color: 'bg-green-500' },
  { value: 'OTHER', label: 'Other', color: 'bg-gray-500' },
] as const;

export function EventFilter({
  filters,
  onFiltersChange,
  className,
  showStatusFilter = true,
}: EventFilterProps) {
  const [isDatePopoverOpen, setIsDatePopoverOpen] = React.useState(false);

  const handleTypeToggle = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    
    onFiltersChange({
      ...filters,
      types: newTypes,
    });
  };

  const handleStatusChange = (status: 'all' | 'upcoming' | 'past') => {
    onFiltersChange({
      ...filters,
      status,
    });
  };

  const handleDateRangeChange = (range: { start: Date | undefined; end: Date | undefined }) => {
    onFiltersChange({
      ...filters,
      dateRange: range,
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      types: [],
      dateRange: { start: undefined, end: undefined },
      status: 'all',
    });
  };

  const hasActiveFilters =
    filters.types.length > 0 ||
    filters.dateRange.start ||
    filters.dateRange.end ||
    filters.status !== 'all';

  const dateRangeText = React.useMemo(() => {
    const start = filters.dateRange.start;
    const end = filters.dateRange.end;
    
    if (!start && !end) {
      return 'All dates';
    }
    if (start && !end) {
      return `From ${formatDate(start)}`;
    }
    if (!start && end) {
      return `Until ${formatDate(end)}`;
    }
    // Both dates are defined at this point
    return `${formatDate(start!)} - ${formatDate(end!)}`;
  }, [filters.dateRange]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Type filter badges */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-sm text-muted-foreground mr-1">Type:</span>
          {EVENT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => handleTypeToggle(type.value)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filters.types.includes(type.value)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  type.color,
                  filters.types.includes(type.value) && 'bg-primary-foreground'
                )}
              />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Status filter */}
        {showStatusFilter && (
          <Select
            value={filters.status}
            onValueChange={(value) => handleStatusChange(value as 'all' | 'upcoming' | 'past')}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="past">Past</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Date range filter */}
        <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              <span className="hidden sm:inline">{dateRangeText}</span>
              <span className="sm:hidden">Dates</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{
                from: filters.dateRange.start,
                to: filters.dateRange.end,
              }}
              onSelect={(range) => {
                handleDateRangeChange({
                  start: range?.from,
                  end: range?.to,
                });
              }}
              numberOfMonths={2}
            />
            <div className="flex items-center justify-between border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  handleDateRangeChange({ start: undefined, end: undefined });
                  setIsDatePopoverOpen(false);
                }}
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setIsDatePopoverOpen(false)}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear all filters */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Active filters summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Filter className="h-3 w-3" />
          <span>Filtering by:</span>
          {filters.types.length > 0 && (
            <span>
              {filters.types.length} type{filters.types.length !== 1 ? 's' : ''}
            </span>
          )}
          {filters.status !== 'all' && (
            <Badge variant="outline" className="text-xs">
              {filters.status === 'upcoming' ? 'Upcoming' : 'Past'}
            </Badge>
          )}
          {(filters.dateRange.start || filters.dateRange.end) && (
            <Badge variant="outline" className="text-xs">
              {dateRangeText}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// Hook for managing filter state
export function useEventFilters(initialFilters?: Partial<EventFilterState>) {
  const [filters, setFilters] = React.useState<EventFilterState>({
    types: initialFilters?.types || [],
    dateRange: initialFilters?.dateRange || { start: undefined, end: undefined },
    status: initialFilters?.status || 'all',
  });

  return {
    filters,
    setFilters,
    clearFilters: () =>
      setFilters({
        types: [],
        dateRange: { start: undefined, end: undefined },
        status: 'all',
      }),
    hasActiveFilters:
      filters.types.length > 0 ||
      !!filters.dateRange.start ||
      !!filters.dateRange.end ||
      filters.status !== 'all',
  };
}

export default EventFilter;
