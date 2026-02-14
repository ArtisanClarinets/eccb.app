'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Service Worker Registration Provider
 *
 * PWA functionality is currently disabled. This component keeps the
 * useOnlineStatus hook for offline detection but does not register
 * a service worker.
 *
 * To re-enable PWA:
 * 1. Create proper PWA icons in public/icons/
 * 2. Update manifest.json with icon paths and display: "standalone"
 * 3. Uncomment the registration logic below
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // PWA disabled - service worker registration commented out
    // To re-enable, uncomment the following block and ensure icons exist:
    //
    // if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    //   navigator.serviceWorker
    //     .register('/sw.js')
    //     .then((registration) => {
    //       console.log('Service Worker registered:', registration.scope);
    //     })
    //     .catch((error) => {
    //       console.error('Service Worker registration failed:', error);
    //     });
    // }
  }, []);

  return null;
}

/**
 * Hook to detect online/offline status
 * Works independently of service worker registration
 */
export function useOnlineStatus() {
  const isOnline = useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    () => navigator.onLine,
    () => true
  );

  return isOnline;
}
