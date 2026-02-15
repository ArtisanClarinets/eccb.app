import { format, formatDistance, formatRelative, isToday, isTomorrow, isThisWeek, parseISO } from 'date-fns';

/**
 * Format a date to a human-readable string
 */
export function formatDate(date: Date | string, formatStr: string = 'MMMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format a time to a human-readable string
 */
export function formatTime(date: Date | string, formatStr: string = 'h:mm a'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

/**
 * Format a date and time together
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMMM d, yyyy \'at\' h:mm a');
}

/**
 * Format a date to a short string
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

/**
 * Get relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistance(d, new Date(), { addSuffix: true });
}

/**
 * Format relative date (e.g., "today at 2:30 PM", "yesterday at 4:00 PM")
 */
export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatRelative(d, new Date());
}

/**
 * Get friendly date label (Today, Tomorrow, This Week, or formatted date)
 */
export function getFriendlyDateLabel(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  
  if (isToday(d)) {
    return 'Today';
  }
  if (isTomorrow(d)) {
    return 'Tomorrow';
  }
  if (isThisWeek(d)) {
    return format(d, 'EEEE'); // Day name
  }
  return format(d, 'MMM d');
}

/**
 * Format a date range
 */
export function formatDateRange(start: Date | string, end: Date | string): string {
  const startDate = typeof start === 'string' ? parseISO(start) : start;
  const endDate = typeof end === 'string' ? parseISO(end) : end;
  
  const sameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');
  
  if (sameDay) {
    return `${format(startDate, 'MMMM d, yyyy')} · ${format(startDate, 'h:mm a')} - ${format(endDate, 'h:mm a')}`;
  }
  
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`;
}

/**
 * Format duration in minutes to human-readable string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} hr`;
  }
  
  return `${hours} hr ${remainingMinutes} min`;
}

/**
 * Parse ISO date string safely
 */
export function safeParseDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  
  try {
    return typeof date === 'string' ? parseISO(date) : date;
  } catch {
    return null;
  }
}

/**
 * Check if a date is in the past
 */
export function isPastDate(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d < new Date();
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return d > new Date();
}

/**
 * Format event date range with day and time
 */
export function formatEventDateRange(start: Date | string, end: Date | string): string {
  const startDate = typeof start === 'string' ? parseISO(start) : start;
  const endDate = typeof end === 'string' ? parseISO(end) : end;
  
  const dayStr = format(startDate, 'EEE, MMM d');
  const startTime = format(startDate, 'h:mm a');
  const endTime = format(endDate, 'h:mm a');
  
  return `${dayStr} • ${startTime} - ${endTime}`;
}

/**
 * Format file size in bytes to human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
