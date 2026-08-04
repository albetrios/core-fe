/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

/** Heavy deferred chunks — precache shell only; fetch at runtime when needed. */
const DEFERRED_PRECACH_PATTERN =
  /\/(sentry|posthog|SettingsModal|dashboard\.route|iconset-phosphor|iconset-tabler|CommandPalette|AppearanceDialog)-/;

function shouldPrecache(entry: string | { url: string }): boolean {
  const url = typeof entry === 'string' ? entry : entry.url;
  return !DEFERRED_PRECACH_PATTERN.test(url);
}

// Clean old caches on SW update
cleanupOutdatedCaches();

const manifest = self.__WB_MANIFEST.filter(shouldPrecache);
precacheAndRoute(manifest);

// Version-update handshake (core/version/check.ts): index.html is precached, so
// while an OLD worker controls the page a plain reload re-serves the OLD shell
// and a newly installed worker would wait until every tab closes. The page
// messages the WAITING worker at a safe moment (idle / user-approved "Refresh
// now") instead of an unconditional skipWaiting() that could swap builds
// mid-task; claim on activate so the follow-up reload is served from the NEW
// precache immediately.
self.addEventListener('message', (event) => {
  // Only same-origin pages can hold a reference to this worker, but verify the
  // sender's origin anyway (defense-in-depth; CodeQL js/missing-origin-check).
  if (event.origin !== self.location.origin) return;
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Lazy JS/CSS chunks — cache on first navigation, reuse on repeat visits
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    (request.destination === 'script' || request.destination === 'style'),
  new StaleWhileRevalidate({
    cacheName: 'app-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  }),
);

// Cache fonts with CacheFirst
registerRoute(
  /^https:\/\/.*\.(woff2|ttf|otf)$/,
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      }),
    ],
  }),
);

// Offline fallback for navigation requests
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match('/offline.html')
          .then((response) => response ?? new Response('Offline', { status: 503 })),
      ),
    );
  }
});
