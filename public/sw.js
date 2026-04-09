/* eslint-disable no-restricted-globals */

const VERSION = "v1";
const APP_SHELL_CACHE = `app-shell-${VERSION}`;
const EPUB_CACHE = `epub-${VERSION}`;

const OFFLINE_URL = "/offline";

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isSameOrigin(url) {
  try {
    return url.origin === self.location.origin;
  } catch {
    return false;
  }
}

function isStaticAssetRequest(url) {
  if (!isSameOrigin(url)) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/pwa/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico")
  );
}

function isEpubApiRequest(url, request) {
  if (!isSameOrigin(url)) return false;
  if (request.method !== "GET") return false;
  return /^\/api\/books\/[0-9a-fA-F-]{36}\/file$/.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.addAll([OFFLINE_URL, "/pwa/icon.svg", "/pwa/maskable.svg"]);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([APP_SHELL_CACHE, EPUB_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (keep.has(k) ? Promise.resolve() : caches.delete(k))));
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const res = await fetch(request);
  if (res && res.ok) {
    await cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = (async () => {
    const res = await fetch(request);
    if (res && res.ok) await cache.put(request, res.clone());
    return res;
  })();
  return cached || networkPromise;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!request || request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(APP_SHELL_CACHE);
          const fallback = await cache.match(OFFLINE_URL);
          return (
            fallback ||
            new Response("Offline", {
              status: 200,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  if (isStaticAssetRequest(url)) {
    event.respondWith(cacheFirst(request, APP_SHELL_CACHE));
    return;
  }

  if (isEpubApiRequest(url, request)) {
    event.respondWith(staleWhileRevalidate(request, EPUB_CACHE));
    return;
  }
});

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        await caches.delete(APP_SHELL_CACHE);
        await caches.delete(EPUB_CACHE);
      })(),
    );
  }
});

