'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Music, Music2, AlertTriangle } from 'lucide-react';
import { useStandStore } from '@/store/standStore';
import { 
  acquireWakeLock, 
  releaseWakeLock, 
  requestFullscreen, 
  exitFullscreen,
  isUsingFallbackWakeLock 
} from '@/lib/wakeLock';

/**
 * PerformanceModeToggle - Toggle for gig/performance mode
 * 
 * Features:
 * - Acquires wake lock to prevent screen sleep
 * - Enters fullscreen mode
 * - Hides controls for distraction-free performance
 * - Falls back to alternative wake lock mechanism when API unavailable
 * 
 * Accessibility:
 * - Provides aria-labels for all states
 * - Announces mode changes to screen readers
 * - Shows notification when using fallback wake lock
 */
export function PerformanceModeToggle() {
  const { gigMode, toggleGigMode, setShowControls, setIsFullscreen } = useStandStore();
  const wakeLockRef = useRef<unknown>(null);
  const isComponentMounted = useRef(true);
  const [showFallbackNotice, setShowFallbackNotice] = useState(false);
  const [isUsingFallback, setIsUsingFallback] = useState(false);

  // Handle enabling gig mode
  const enableGigMode = useCallback(async () => {
    if (!isComponentMounted.current) return;

    // Acquire wake lock with fallback notification
    const wakeLock = await acquireWakeLock(() => {
      // This callback is invoked when fallback is activated
      setShowFallbackNotice(true);
      setIsUsingFallback(true);
      console.log('[PerformanceMode] Using fallback wake lock - screen may still sleep on some devices');
    });
    wakeLockRef.current = wakeLock;

    // Request fullscreen
    await requestFullscreen();
    setIsFullscreen(true);

    // Hide controls
    setShowControls(false);
  }, [setShowControls, setIsFullscreen]);

  // Handle disabling gig mode
  const disableGigMode = useCallback(async () => {
    if (!isComponentMounted.current) return;

    // Release wake lock
    await releaseWakeLock();
    wakeLockRef.current = null;
    setIsUsingFallback(false);
    setShowFallbackNotice(false);

    // Exit fullscreen
    await exitFullscreen();
    setIsFullscreen(false);

    // Show controls
    setShowControls(true);
  }, [setShowControls, setIsFullscreen]);

  // Handle visibility change - re-acquire wake lock when page becomes visible
  const handleVisibilityChange = useCallback(async () => {
    if (!isComponentMounted.current) return;

    if (document.visibilityState === 'visible' && gigMode) {
      // Re-acquire wake lock when page becomes visible again
      const wakeLock = await acquireWakeLock(() => {
        setIsUsingFallback(true);
      });
      wakeLockRef.current = wakeLock;
    }
  }, [gigMode]);

  // Set up visibility change listener with passive option
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleVisibilityChange]);

  // Handle toggle
  const handleToggle = async () => {
    if (gigMode) {
      await disableGigMode();
    } else {
      await enableGigMode();
    }
    toggleGigMode();
  };

  // Dismiss fallback notice
  const dismissFallbackNotice = useCallback(() => {
    setShowFallbackNotice(false);
  }, []);

  // Cleanup on unmount - release wake lock if gig mode is active
  useEffect(() => {
    isComponentMounted.current = true;

    return () => {
      isComponentMounted.current = false;
      // Release wake lock on unmount if active
      if (gigMode) {
        releaseWakeLock();
        exitFullscreen();
      }
    };
  }, [gigMode]);

  // Check if using fallback on mount
  useEffect(() => {
    if (gigMode) {
      setIsUsingFallback(isUsingFallbackWakeLock());
    }
  }, [gigMode]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        title={gigMode ? 'Exit Performance Mode' : 'Enter Performance Mode'}
        aria-label={gigMode ? 'Exit Performance Mode' : 'Enter Performance Mode'}
        aria-pressed={gigMode}
        className={`min-w-[44px] min-h-[44px] ${gigMode ? 'text-primary bg-primary/10' : ''}`}
      >
        {gigMode ? <Music2 className="h-4 w-4" aria-hidden="true" /> : <Music className="h-4 w-4" aria-hidden="true" />}
      </Button>

      {/* Fallback notice when Wake Lock API is not available */}
      {showFallbackNotice && (
        <div 
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4 shadow-lg z-50"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Screen Sleep Prevention Limited
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                Your browser doesn&apos;t fully support screen wake lock. The screen may still turn off during performance. 
                Consider adjusting your device&apos;s sleep settings.
              </p>
              <button
                onClick={dismissFallbackNotice}
                className="text-xs text-yellow-800 dark:text-yellow-200 underline mt-2 hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen reader announcement for mode changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {gigMode && 'Performance mode enabled. Screen will stay awake and controls are hidden.'}
        {!gigMode && gigMode !== undefined && 'Performance mode disabled.'}
        {isUsingFallback && 'Note: Using fallback screen wake prevention. Screen may still sleep on some devices.'}
      </div>
    </>
  );
}

PerformanceModeToggle.displayName = 'PerformanceModeToggle';
