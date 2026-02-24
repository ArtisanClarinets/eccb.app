'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStandStore } from '@/store/standStore';
import { cn } from '@/lib/utils';

// Configuration constants
const SWIPE_THRESHOLD_PX = 50;
const TAP_ZONE_THRESHOLD_PX = 20;
const MIN_TOUCH_TARGET_PX = 44; // WCAG minimum touch target size

interface GestureHandlerProps {
  className?: string;
  enabled?: boolean;
}

type Orientation = 'portrait' | 'landscape';

/**
 * GestureHandler - Advanced page turning gesture detection for the digital music stand
 * 
 * Handles:
 * - Swipe left/right for page navigation
 * - Tap zones (left/right halves) for navigation
 * - Portrait mode: half-page scrolling
 * - Landscape mode: two-page turn
 * 
 * Accessibility:
 * - Uses pointer events for cross-device compatibility
 * - Provides ARIA labels for screen readers
 * - Maintains 44x44px minimum touch targets
 */
export function GestureHandler({ className, enabled = true }: GestureHandlerProps) {
  const {
    settings,
    currentPieceIndex: _currentPieceIndex,
    pieces: _pieces,
    nextPageOrPiece,
    prevPageOrPiece,
    scrollHalfPage,
    nextTwoPages,
    prevTwoPages,
  } = useStandStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [isPortrait, setIsPortrait] = useState<Orientation>('landscape');

  // Determine orientation based on screen dimensions
  const checkOrientation = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    setIsPortrait(height > width ? 'portrait' : 'landscape');
  }, []);

  // Listen for orientation changes with passive listener for performance
  useEffect(() => {
    checkOrientation();

    const mediaQuery = window.matchMedia('(orientation: portrait)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsPortrait(e.matches ? 'portrait' : 'landscape');
    };

    mediaQuery.addEventListener('change', handleChange, { passive: true });
    window.addEventListener('resize', checkOrientation, { passive: true });

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('resize', checkOrientation);
    };
  }, [checkOrientation]);

  // Haptic feedback helper
  const triggerHaptic = useCallback(() => {
    if (settings.hapticFeedback && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, [settings.hapticFeedback]);

  // Handle pointer down event
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !settings.swipeGesture) return;

      pointerStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
      };
    },
    [enabled, settings.swipeGesture]
  );

  // Handle pointer up event - determine gesture type
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || !settings.swipeGesture || !pointerStartRef.current) return;

      const startX = pointerStartRef.current.x;
      const startY = pointerStartRef.current.y;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const _deltaTime = Date.now() - pointerStartRef.current.time;

      // Reset start ref
      pointerStartRef.current = null;

      // Get container dimensions for zone calculations
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const containerWidth = rect.width;
      const _containerHeight = rect.height;

      // Determine if this is a swipe or tap
      const isSwipe = Math.abs(deltaX) > TAP_ZONE_THRESHOLD_PX || Math.abs(deltaY) > TAP_ZONE_THRESHOLD_PX;

      if (isSwipe) {
        // Swipe gesture
        const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
        
        if (isHorizontalSwipe) {
          // Horizontal swipe - page turn (setlist-aware)
          if (deltaX < -SWIPE_THRESHOLD_PX) {
            // Swipe left - next page/piece
            triggerHaptic();
            if (isPortrait === 'landscape') {
              nextTwoPages();
            } else {
              nextPageOrPiece();
            }
          } else if (deltaX > SWIPE_THRESHOLD_PX) {
            // Swipe right - previous page/piece
            triggerHaptic();
            if (isPortrait === 'landscape') {
              prevTwoPages();
            } else {
              prevPageOrPiece();
            }
          }
        } else {
          // Vertical swipe in portrait - half page scroll
          if (isPortrait === 'portrait') {
            if (deltaY < -SWIPE_THRESHOLD_PX) {
              // Swipe up - scroll half page forward
              triggerHaptic();
              scrollHalfPage();
            } else if (deltaY > SWIPE_THRESHOLD_PX) {
              // Swipe down - scroll half page back
              triggerHaptic();
              scrollHalfPage();
            }
          }
        }
      } else {
        // Tap gesture - check zone
        const clickX = startX - rect.left;
        const _clickY = startY - rect.top;

        if (isPortrait === 'portrait') {
          // In portrait mode, tap right half for half-page scroll
          if (clickX > containerWidth * 0.5) {
            // Right half tap - advance half page
            triggerHaptic();
            scrollHalfPage();
          } else if (clickX < containerWidth * 0.25) {
            // Far left tap - go to previous page/piece (setlist-aware)
            triggerHaptic();
            prevPageOrPiece();
          }
        } else {
          // In landscape mode, simple left/right tap
          if (clickX > containerWidth * 0.7) {
            // Right side tap - next two pages
            triggerHaptic();
            nextTwoPages();
          } else if (clickX < containerWidth * 0.3) {
            // Left side tap - previous two pages
            triggerHaptic();
            prevTwoPages();
          } else {
            // Center tap - single page/piece (setlist-aware)
            if (clickX > containerWidth * 0.5) {
              triggerHaptic();
              nextPageOrPiece();
            } else {
              triggerHaptic();
              prevPageOrPiece();
            }
          }
        }
      }

      // Emit custom event for external listeners
      window.dispatchEvent(
        new CustomEvent('pageTurn', {
          detail: {
            direction: deltaX < 0 ? 'next' : 'previous',
            type: isSwipe ? 'swipe' : 'tap',
            orientation: isPortrait,
          },
        })
      );
    },
    [
      enabled,
      settings.swipeGesture,
      isPortrait,
      nextPageOrPiece,
      prevPageOrPiece,
      scrollHalfPage,
      nextTwoPages,
      prevTwoPages,
      triggerHaptic,
    ]
  );

  // Handle pointer cancel to clean up
  const handlePointerCancel = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  // Don't render if disabled
  if (!enabled) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute inset-0 z-10',
        // Enable touch events for mobile
        'touch-none',
        // Visual feedback debug (can be disabled in production)
        'pointer-events-auto',
        className
      )}
      style={{
        // Prevent text selection during gestures
        userSelect: 'none',
        WebkitUserSelect: 'none',
        // Ensure minimum touch target size for accessibility
        minWidth: MIN_TOUCH_TARGET_PX,
        minHeight: MIN_TOUCH_TARGET_PX,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role="application"
      aria-label="Page navigation gesture area. Swipe left or right to turn pages, tap left or right sides for navigation."
      tabIndex={0}
      // Provide keyboard instructions for screen readers
      aria-describedby="gesture-help"
    >
      {/* Screen reader instructions */}
      <div id="gesture-help" className="sr-only">
        Use arrow keys to navigate pages. Swipe or tap on touch devices.
      </div>
      {/* Touch zone indicators for accessibility - visually hidden but announced */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <span>Current orientation: {isPortrait}. </span>
        <span>
          {isPortrait === 'portrait' 
            ? 'Tap right half to scroll half page, far left to go back.' 
            : 'Tap left or right sides for two-page navigation, center for single page.'}
        </span>
      </div>
    </div>
  );
}

GestureHandler.displayName = 'GestureHandler';

export default GestureHandler;
