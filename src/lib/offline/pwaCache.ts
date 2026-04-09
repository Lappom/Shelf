export const PWA_CACHE_VERSION = "v1";
export const APP_SHELL_CACHE = `app-shell-${PWA_CACHE_VERSION}`;
export const EPUB_CACHE = `epub-${PWA_CACHE_VERSION}`;

export async function isEpubCached(fileUrl: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("caches" in window)) return false;
  try {
    const cache = await caches.open(EPUB_CACHE);
    const hit = await cache.match(fileUrl);
    return !!hit;
  } catch {
    return false;
  }
}

export async function cacheEpub(fileUrl: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("caches" in window)) return;
  // Trigger fetch; SW will cache it if installed. If SW isn't installed yet,
  // this still ensures the file is read once and can be cached later.
  await fetch(fileUrl, { method: "GET" });
}

export async function purgeEpub(fileUrl: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("caches" in window)) return;
  const cache = await caches.open(EPUB_CACHE);
  await cache.delete(fileUrl);
}

export async function clearAllPwaCaches(): Promise<void> {
  if (typeof window === "undefined") return;
  if (!("caches" in window)) return;
  await Promise.all([caches.delete(APP_SHELL_CACHE), caches.delete(EPUB_CACHE)]);
}
