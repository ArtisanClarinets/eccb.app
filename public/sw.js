/**
 * Service Worker - PWA Disabled
 *
 * This is a minimal service worker that immediately unregisters itself.
 * It exists to clean up any previously registered service workers.
 *
 * PWA functionality is currently disabled for this application.
 * To re-enable PWA:
 * 1. Create proper PWA icons in public/icons/
 * 2. Update manifest.json with icon paths and display: "standalone"
 * 3. Implement full service worker caching logic
 */

// Self-unregister to clean up any previous registrations
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Unregister all service workers
  event.waitUntil(
    self.registration.unregister().then(() => {
      console.log('[ServiceWorker] Unregistered - PWA disabled');
      return self.clients.matchAll();
    }).then((clients) => {
      // Refresh all open pages
      clients.forEach((client) => {
        if (client.navigate) {
          client.navigate(client.url);
        }
      });
    })
  );
});

// Pass-through fetch - no caching
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
