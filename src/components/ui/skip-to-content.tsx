'use client';

import { getSkipToContentProps } from '@/lib/a11y';
import { cn } from '@/lib/utils';

interface SkipToContentProps {
  /** Target element ID to skip to */
  targetId?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Skip-to-content link for keyboard navigation accessibility.
 * This link is visually hidden until focused, allowing keyboard users
 * to bypass navigation and jump directly to the main content.
 */
export function SkipToContent({
  targetId = 'main-content',
  className,
}: SkipToContentProps) {
  const props = getSkipToContentProps(targetId);

  return (
    <a
      {...props}
      className={cn(
        // Visually hidden by default
        'sr-only',
        // Become visible when focused
        'focus:not-sr-only',
        'focus:absolute',
        'focus:top-4',
        'focus:left-4',
        'focus:z-[9999]',
        'focus:px-4',
        'focus:py-2',
        'focus:bg-primary',
        'focus:text-primary-foreground',
        'focus:rounded-md',
        'focus:shadow-lg',
        'focus:outline-none',
        'focus:ring-2',
        'focus:ring-ring',
        'focus:ring-offset-2',
        // Transition for smooth appearance
        'focus:transition-all',
        'focus:duration-150',
        className
      )}
    >
      Skip to main content
    </a>
  );
}
