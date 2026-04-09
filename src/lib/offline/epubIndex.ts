import { getOfflineDb } from "@/lib/offline/idb";
import { cacheEpub, isEpubCached, purgeEpub } from "@/lib/offline/pwaCache";

export type OfflineEpubIndexRow = {
  bookId: string;
  fileUrl: string;
  firstSeenAt: number;
  lastSeenAt: number;
};

export async function ensureEpubCachedAndIndexed(opts: { bookId: string; fileUrl: string }) {
  const now = Date.now();
  const db = await getOfflineDb();

  const existing = await db.get<OfflineEpubIndexRow>("offlineEpubIndex", opts.bookId);
  if (existing) {
    await db.put("offlineEpubIndex", { ...existing, lastSeenAt: now });
  } else {
    await db.put("offlineEpubIndex", {
      bookId: opts.bookId,
      fileUrl: opts.fileUrl,
      firstSeenAt: now,
      lastSeenAt: now,
    } satisfies OfflineEpubIndexRow);
  }

  const cached = await isEpubCached(opts.fileUrl);
  if (!cached) {
    await cacheEpub(opts.fileUrl);
  }
}

export async function listIndexedEpubs(): Promise<OfflineEpubIndexRow[]> {
  const db = await getOfflineDb();
  const rows = await db.getAll<OfflineEpubIndexRow>("offlineEpubIndex");
  return rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function purgeIndexedEpub(opts: { bookId: string; fileUrl: string }) {
  await purgeEpub(opts.fileUrl);
  const db = await getOfflineDb();
  await db.delete("offlineEpubIndex", opts.bookId);
}

