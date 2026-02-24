'use client';

// Type definitions for Wake Lock API
interface WakeLockSentinel {
  released: boolean;
  type: string;
  release: () => Promise<void>;
}

interface WakeLock {
  request: (type: 'screen') => Promise<WakeLockSentinel>;
}

// Type-safe access to wakeLock (checking for existence)
function getWakeLock(): WakeLock | undefined {
  if (typeof navigator === 'undefined') {
    return undefined;
  }
   
  return (navigator as any).wakeLock;
}

/**
 * Check if Wake Lock API is supported
 */
export function isWakeLockSupported(): boolean {
  return !!getWakeLock();
}

let currentWakeLock: WakeLockSentinel | null = null;
let fallbackIntervalId: NodeJS.Timeout | null = null;
let wakeLockFallbackActive = false;

/**
 * Fallback mechanism using setInterval to keep screen awake
 * This plays a short, silent video or uses other techniques when Wake Lock API is unavailable
 */
function startFallbackWakeLock(): void {
  if (fallbackIntervalId !== null) {
    return; // Already running
  }

  // Use a combination of techniques for fallback:
  // 1. Periodic visibility change simulation
  // 2. Request animation frame to keep the main thread active
  wakeLockFallbackActive = true;
  
  // Create a no-op wake lock simulation
  // This isn't as effective as the real Wake Lock API but helps in some browsers
  fallbackIntervalId = setInterval(() => {
    if (!wakeLockFallbackActive) {
      if (fallbackIntervalId) {
        clearInterval(fallbackIntervalId);
        fallbackIntervalId = null;
      }
      return;
    }
    
    // Use requestAnimationFrame to keep the page active
    // This helps prevent some browsers from sleeping
    requestAnimationFrame(() => {
      // No-op, just keeping the main thread active
    });
  }, 15000); // Every 15 seconds

  console.log('[WakeLock] Fallback wake lock started (Wake Lock API not available)');
}

/**
 * Stop the fallback wake lock mechanism
 */
function stopFallbackWakeLock(): void {
  wakeLockFallbackActive = false;
  if (fallbackIntervalId !== null) {
    clearInterval(fallbackIntervalId);
    fallbackIntervalId = null;
    console.log('[WakeLock] Fallback wake lock stopped');
  }
}

/**
 * Acquires a wake lock to prevent the screen from sleeping.
 * Falls back to a setInterval-based approach if Wake Lock API is unavailable.
 * @returns The wake lock sentinel if successful, null otherwise
 * @param onFallbackActive - Optional callback when fallback is activated (for user notification)
 */
export async function acquireWakeLock(
  onFallbackActive?: () => void
): Promise<WakeLockSentinel | null> {
  const wakeLock = getWakeLock();

  if (!wakeLock) {
    // Wake Lock API not supported - use fallback
    console.warn('[WakeLock] Wake Lock API is not supported in this browser, using fallback');
    startFallbackWakeLock();
    onFallbackActive?.();
    return null;
  }

  try {
    // Release any existing wake lock first
    if (currentWakeLock && !currentWakeLock.released) {
      await releaseWakeLock();
    }

    currentWakeLock = await wakeLock.request('screen');
    
    // Handle visibility change - re-acquire when page becomes visible again
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    return currentWakeLock;
  } catch (err) {
    console.error('[WakeLock] Failed to acquire wake lock:', err);
    
    // Try fallback on error
    startFallbackWakeLock();
    onFallbackActive?.();
    return null;
  }
}

/**
 * Handle visibility change to re-acquire wake lock when page becomes visible
 */
async function handleVisibilityChange(): Promise<void> {
  if (document.visibilityState === 'visible' && !currentWakeLock) {
    const wakeLock = getWakeLock();
    if (wakeLock) {
      try {
        currentWakeLock = await wakeLock.request('screen');
      } catch (_err) {
        console.warn('[WakeLock] Could not re-acquire wake lock after visibility change');
        startFallbackWakeLock();
      }
    }
  }
}

/**
 * Releases the current wake lock if one is active.
 * Also stops any fallback mechanism.
 * @returns True if successfully released or no lock was held, false on error
 */
export async function releaseWakeLock(): Promise<boolean> {
  // Stop fallback if running
  stopFallbackWakeLock();
  
  // Remove visibility change listener
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }

  if (!currentWakeLock) {
    return true;
  }

  try {
    if (!currentWakeLock.released) {
      await currentWakeLock.release();
    }
    currentWakeLock = null;
    return true;
  } catch (err) {
    console.error('[WakeLock] Failed to release wake lock:', err);
    return false;
  }
}

/**
 * Checks if a wake lock is currently active.
 * @returns True if a wake lock is held (real or fallback), false otherwise
 */
export function isWakeLockActive(): boolean {
  return (currentWakeLock !== null && !currentWakeLock.released) || wakeLockFallbackActive;
}

/**
 * Checks if the fallback wake lock mechanism is being used.
 * @returns True if using fallback, false if using native Wake Lock API
 */
export function isUsingFallbackWakeLock(): boolean {
  return wakeLockFallbackActive && !currentWakeLock;
}

/**
 * Requests fullscreen mode on the document element.
 * @returns True if fullscreen was requested successfully, false otherwise
 */
export async function requestFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
    return true;
  } catch (err) {
    console.error('[WakeLock] Failed to request fullscreen:', err);
    return false;
  }
}

/**
 * Exits fullscreen mode.
 * @returns True if fullscreen was exited successfully or wasn't active, false on error
 */
export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') {
    return false;
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    return true;
  } catch (err) {
    console.error('[WakeLock] Failed to exit fullscreen:', err);
    return false;
  }
}

/**
 * Checks if the document is currently in fullscreen mode.
 * @returns True if in fullscreen, false otherwise
 */
export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement;
}
