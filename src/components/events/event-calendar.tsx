'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  List,
  LayoutGrid,
  Clock,
  MapPin,
} from 'lucide-react';
import { formatDate, formatTime } from '@/lib/date';
import Link from 'next/link';

// Types
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  type: 'CONCERT' | 'REHEARSAL' | 'SECTIONAL' | 'BOARD_MEETING' | 'SOCIAL' | 'OTHER';
  startTime: Date | string;
  endTime: Date | string;
  location?: string | null;
  isCancelled?: boolean;
  musicCount?: number;
  venue?: {
    name: string;
  } | null;
}

export type ViewMode = 'month' | 'week' | 'list';

interface EventCalendarProps {
  events: CalendarEvent[];
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onEventClick?: (event: CalendarEvent) => void;
  eventHref?: (event: CalendarEvent) => string;
  className?: string;
  showViewToggle?: boolean;
  selectedTypes?: string[];
  onTypeFilter?: (types: string[]) => void;
  dateRange?: { start: Date; end: Date };
  onDateRangeChange?: (range: { start: Date; end: Date }) => void;
}

// Event type colors
const eventTypeColors: Record<string, string> = {
  CONCERT: 'bg-primary text-primary-foreground',
  REHEARSAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  SECTIONAL: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  BOARD_MEETING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SOCIAL: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
};

const eventTypeDotColors: Record<string, string> = {
  CONCERT: 'bg-primary',
  REHEARSAL: 'bg-blue-500',
  SECTIONAL: 'bg-purple-500',
  BOARD_MEETING: 'bg-amber-500',
  SOCIAL: 'bg-green-500',
  OTHER: 'bg-gray-500',
};

// Helper functions
function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Add days from previous month to fill first week
  const firstDayOfWeek = firstDay.getDay();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // Add all days of the month
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  // Add days from next month to fill last week
  const remainingDays = 42 - days.length; // 6 rows * 7 days
  for (let i = 1; i <= remainingDays; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function getWeekDays(date: Date): Date[] {
  const days: Date[] = [];
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - date.getDay());

  for (let i = 0; i < 7; i++) {
    days.push(new Date(startOfWeek));
    startOfWeek.setDate(startOfWeek.getDate() + 1);
  }

  return days;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((event) => {
    const eventDate = new Date(event.startTime);
    return isSameDay(eventDate, day);
  });
}

function getHoursForDay(events: CalendarEvent[], day: Date): Map<number, CalendarEvent[]> {
  const hours = new Map<number, CalendarEvent[]>();
  
  getEventsForDay(events, day)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .forEach((event) => {
      const hour = new Date(event.startTime).getHours();
      const existing = hours.get(hour) || [];
      hours.set(hour, [...existing, event]);
    });

  return hours;
}

// Components
function MonthView({
  days,
  events,
  currentDate,
  onEventClick,
  eventHref,
}: {
  days: Date[];
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick?: (event: CalendarEvent) => void;
  eventHref?: (event: CalendarEvent) => string;
}) {
  const today = new Date();
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="grid grid-cols-7 bg-muted/50">
        {weekDays.map((day) => (
          <div
            key={day}
            className="px-2 py-3 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dayEvents = getEventsForDay(events, day);
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = isSameDay(day, today);

          return (
            <div
              key={index}
              className={cn(
                'min-h-[100px] border-t border-r p-1 last:border-r-0',
                !isCurrentMonth && 'bg-muted/30'
              )}
            >
              <div
                className={cn(
                  'mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm',
                  isToday && 'bg-primary text-primary-foreground font-semibold',
                  !isCurrentMonth && 'text-muted-foreground'
                )}
              >
                {day.getDate()}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => {
                  const content = (
                    <div
                      className={cn(
                        'truncate rounded px-1.5 py-0.5 text-xs font-medium',
                        eventTypeColors[event.type],
                        event.isCancelled && 'opacity-50 line-through'
                      )}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  );

                  if (eventHref) {
                    return (
                      <Link
                        key={event.id}
                        href={eventHref(event)}
                        onClick={() => onEventClick?.(event)}
                      >
                        {content}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick?.(event)}
                      className="w-full text-left"
                    >
                      {content}
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="px-1.5 text-xs text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  days,
  events,
  onEventClick,
  eventHref,
}: {
  days: Date[];
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  eventHref?: (event: CalendarEvent) => string;
}) {
  const today = new Date();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header with days */}
      <div className="grid grid-cols-8 bg-muted/50">
        <div className="w-16 border-r" />
        {days.map((day, index) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={index}
              className={cn(
                'flex flex-col items-center py-2 border-r last:border-r-0',
                isToday && 'bg-primary/10'
              )}
            >
              <span className="text-xs text-muted-foreground">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span
                className={cn(
                  'text-lg font-semibold',
                  isToday && 'text-primary'
                )}
              >
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-8 border-t">
            <div className="w-16 border-r py-2 pr-2 text-right text-xs text-muted-foreground">
              {hour === 0
                ? '12 AM'
                : hour < 12
                  ? `${hour} AM`
                  : hour === 12
                    ? '12 PM'
                    : `${hour - 12} PM`}
            </div>
            {days.map((day, dayIndex) => {
              const hourEvents = getHoursForDay(events, day).get(hour) || [];
              const isToday = isSameDay(day, today);

              return (
                <div
                  key={dayIndex}
                  className={cn(
                    'min-h-[40px] border-r p-0.5 last:border-r-0',
                    isToday && 'bg-primary/5'
                  )}
                >
                  {hourEvents.map((event) => {
                    const content = (
                      <div
                        className={cn(
                          'rounded px-1 py-0.5 text-xs',
                          eventTypeColors[event.type],
                          event.isCancelled && 'opacity-50 line-through'
                        )}
                      >
                        <div className="font-medium truncate">{event.title}</div>
                        <div className="truncate opacity-75">
                          {formatTime(event.startTime)}
                        </div>
                      </div>
                    );

                    if (eventHref) {
                      return (
                        <Link
                          key={event.id}
                          href={eventHref(event)}
                          onClick={() => onEventClick?.(event)}
                        >
                          {content}
                        </Link>
                      );
                    }

                    return (
                      <button
                        key={event.id}
                        onClick={() => onEventClick?.(event)}
                        className="w-full text-left"
                      >
                        {content}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListView({
  events,
  onEventClick,
  eventHref,
}: {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  eventHref?: (event: CalendarEvent) => string;
}) {
  // Group events by date
  const eventsByDate = events.reduce(
    (acc, event) => {
      const dateKey = formatDate(event.startTime, 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(event);
      return acc;
    },
    {} as Record<string, CalendarEvent[]>
  );

  const sortedDates = Object.keys(eventsByDate).sort();

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium">No Events</h3>
        <p className="text-sm text-muted-foreground mt-1">
          No events match your current filters
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => {
        const dayEvents = eventsByDate[dateKey].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const date = new Date(dateKey);

        return (
          <div key={dateKey}>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
              {formatDate(date, 'EEEE, MMMM d, yyyy')}
            </h3>
            <div className="space-y-2">
              {dayEvents.map((event) => {
                const content = (
                  <div
                    className={cn(
                      'flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                      event.isCancelled && 'opacity-50'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-1 h-3 w-3 rounded-full flex-shrink-0',
                        eventTypeDotColors[event.type]
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'font-medium',
                            event.isCancelled && 'line-through'
                          )}
                        >
                          {event.title}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {event.type.replace('_', ' ')}
                        </Badge>
                        {event.isCancelled && (
                          <Badge variant="destructive" className="text-xs">
                            Cancelled
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTime(event.startTime)} - {formatTime(event.endTime)}
                        </div>
                        {(event.location || event.venue) && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.venue?.name || event.location}
                          </div>
                        )}
                      </div>
                      {event.description && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {event.description}
                        </p>
                      )}
                    </div>
                  </div>
                );

                if (eventHref) {
                  return (
                    <Link
                      key={event.id}
                      href={eventHref(event)}
                      onClick={() => onEventClick?.(event)}
                      className="block"
                    >
                      {content}
                    </Link>
                  );
                }

                return (
                  <button
                    key={event.id}
                    onClick={() => onEventClick?.(event)}
                    className="w-full text-left"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EventCalendar({
  events,
  viewMode = 'month',
  onViewModeChange,
  onEventClick,
  eventHref,
  className,
  showViewToggle = true,
}: EventCalendarProps) {
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [internalViewMode, setInternalViewMode] = React.useState<ViewMode>(viewMode);

  const activeViewMode = onViewModeChange ? viewMode : internalViewMode;
  const setActiveViewMode = onViewModeChange || setInternalViewMode;

  // Filter events for current view
  const filteredEvents = React.useMemo(() => {
    if (activeViewMode === 'list') {
      return events;
    }

    // For month/week views, filter to relevant date range
    if (activeViewMode === 'month') {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      return events.filter((event) => {
        const eventDate = new Date(event.startTime);
        return eventDate >= monthStart && eventDate <= monthEnd;
      });
    }

    if (activeViewMode === 'week') {
      const weekDays = getWeekDays(currentDate);
      const weekStart = weekDays[0];
      const weekEnd = weekDays[6];
      weekEnd.setHours(23, 59, 59, 999);

      return events.filter((event) => {
        const eventDate = new Date(event.startTime);
        return eventDate >= weekStart && eventDate <= weekEnd;
      });
    }

    return events;
  }, [events, currentDate, activeViewMode]);

  const days = activeViewMode === 'month'
    ? getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
    : getWeekDays(currentDate);

  const navigatePrev = () => {
    const newDate = new Date(currentDate);
    if (activeViewMode === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (activeViewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const navigateToday = () => {
    setCurrentDate(new Date());
  };

  const title = activeViewMode === 'month'
    ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `Week of ${formatDate(days[0], 'MMM d, yyyy')}`;

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={navigateToday}>
            Today
          </Button>
          <h2 className="ml-2 text-lg font-semibold">{title}</h2>
        </div>

        {showViewToggle && (
          <div className="flex items-center gap-1 rounded-lg border p-1">
            <Button
              variant={activeViewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveViewMode('month')}
              className="gap-1"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Month</span>
            </Button>
            <Button
              variant={activeViewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveViewMode('week')}
              className="gap-1"
            >
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Week</span>
            </Button>
            <Button
              variant={activeViewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveViewMode('list')}
              className="gap-1"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">List</span>
            </Button>
          </div>
        )}
      </div>

      {/* Views */}
      {activeViewMode === 'month' && (
        <MonthView
          days={days}
          events={filteredEvents}
          currentDate={currentDate}
          onEventClick={onEventClick}
          eventHref={eventHref}
        />
      )}
      {activeViewMode === 'week' && (
        <WeekView
          days={days}
          events={filteredEvents}
          onEventClick={onEventClick}
          eventHref={eventHref}
        />
      )}
      {activeViewMode === 'list' && (
        <ListView
          events={filteredEvents}
          onEventClick={onEventClick}
          eventHref={eventHref}
        />
      )}
    </div>
  );
}

export default EventCalendar;
