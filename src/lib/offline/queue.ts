import { getOfflineDb } from "@/lib/offline/idb";

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type OfflineQueueItem =
  | {
      id: string;
      createdAt: number;
      bookId: string;
      kind: "annotation_create";
      url: string;
      body: JsonValue;
    }
  | {
      id: string;
      createdAt: number;
      bookId: string;
      kind: "annotation_patch";
      url: string;
      body: JsonValue;
    }
  | {
      id: string;
      createdAt: number;
      bookId: string;
      kind: "annotation_delete";
      url: string;
      body: null;
    };

export type OfflineProgressRow = {
  bookId: string;
  updatedAt: number;
  url: string;
  body: JsonValue;
};

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function isOfflineLikeError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Load failed") ||
    msg.includes("fetch") ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

async function enqueue(item: OfflineQueueItem) {
  const db = await getOfflineDb();
  await db.put("offlineQueue", item);
}

export async function queueProgressUpdate(opts: { bookId: string; url: string; body: JsonValue }) {
  const db = await getOfflineDb();
  const row: OfflineProgressRow = {
    bookId: opts.bookId,
    updatedAt: Date.now(),
    url: opts.url,
    body: opts.body,
  };
  await db.put("offlineProgress", row);
}

export async function queueAnnotationCreate(opts: { bookId: string; url: string; body: JsonValue }) {
  await enqueue({
    id: uuid(),
    createdAt: Date.now(),
    bookId: opts.bookId,
    kind: "annotation_create",
    url: opts.url,
    body: opts.body,
  });
}

export async function queueAnnotationPatch(opts: { bookId: string; url: string; body: JsonValue }) {
  await enqueue({
    id: uuid(),
    createdAt: Date.now(),
    bookId: opts.bookId,
    kind: "annotation_patch",
    url: opts.url,
    body: opts.body,
  });
}

export async function queueAnnotationDelete(opts: { bookId: string; url: string }) {
  await enqueue({
    id: uuid(),
    createdAt: Date.now(),
    bookId: opts.bookId,
    kind: "annotation_delete",
    url: opts.url,
    body: null,
  });
}

async function postJson(url: string, method: string, body: JsonValue | null) {
  const res = await fetch(url, {
    method,
    headers: body == null ? undefined : { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
    credentials: "include",
  });
  return res;
}

export async function flushOfflineQueue(): Promise<{ ok: boolean; sent: number; remaining: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, sent: 0, remaining: 0 };
  }

  const db = await getOfflineDb();
  let sent = 0;

  // 1) Flush coalesced progress (last-write-wins per book)
  const progressRows = await db.getAll<OfflineProgressRow>("offlineProgress");
  for (const row of progressRows) {
    try {
      const res = await postJson(row.url, "PUT", row.body);
      if (res.ok) {
        await db.delete("offlineProgress", row.bookId);
        sent += 1;
        continue;
      }
      // 4xx: drop (payload invalid or forbidden), 5xx: keep for retry
      if (res.status >= 400 && res.status < 500) {
        await db.delete("offlineProgress", row.bookId);
      }
    } catch (e) {
      if (!isOfflineLikeError(e)) {
        // Unknown failure: keep for retry.
      }
      return { ok: false, sent, remaining: (await db.getAll("offlineQueue")).length + (await db.getAll("offlineProgress")).length };
    }
  }

  // 2) Flush annotation queue in order
  const queueItems = await db.getAll<OfflineQueueItem>("offlineQueue");
  queueItems.sort((a, b) => a.createdAt - b.createdAt);
  for (const item of queueItems) {
    try {
      const res =
        item.kind === "annotation_create"
          ? await postJson(item.url, "POST", item.body)
          : item.kind === "annotation_patch"
            ? await postJson(item.url, "PATCH", item.body)
            : await postJson(item.url, "DELETE", null);

      if (res.ok) {
        await db.delete("offlineQueue", item.id);
        sent += 1;
        continue;
      }

      if (res.status >= 400 && res.status < 500) {
        await db.delete("offlineQueue", item.id);
      } else {
        // 5xx: stop early to retry later (avoid hammering).
        break;
      }
    } catch (e) {
      if (!isOfflineLikeError(e)) {
        // keep for retry
      }
      break;
    }
  }

  const remaining = (await db.getAll("offlineQueue")).length + (await db.getAll("offlineProgress")).length;
  return { ok: remaining === 0, sent, remaining };
}

export async function offlineOrQueueProgress(opts: { bookId: string; url: string; body: JsonValue }) {
  try {
    const res = await postJson(opts.url, "PUT", opts.body);
    if (res.ok) return { queued: false };
    if (res.status >= 500) throw new Error("SERVER_ERROR");
    return { queued: false };
  } catch (e) {
    if (!isOfflineLikeError(e)) throw e;
    await queueProgressUpdate(opts);
    return { queued: true };
  }
}

export async function offlineOrQueueAnnotationCreate(opts: { bookId: string; url: string; body: JsonValue }) {
  try {
    const res = await postJson(opts.url, "POST", opts.body);
    if (res.ok) return { queued: false };
    if (res.status >= 500) throw new Error("SERVER_ERROR");
    return { queued: false };
  } catch (e) {
    if (!isOfflineLikeError(e)) throw e;
    await queueAnnotationCreate(opts);
    return { queued: true };
  }
}

export async function offlineOrQueueAnnotationPatch(opts: { bookId: string; url: string; body: JsonValue }) {
  try {
    const res = await postJson(opts.url, "PATCH", opts.body);
    if (res.ok) return { queued: false };
    if (res.status >= 500) throw new Error("SERVER_ERROR");
    return { queued: false };
  } catch (e) {
    if (!isOfflineLikeError(e)) throw e;
    await queueAnnotationPatch(opts);
    return { queued: true };
  }
}

export async function offlineOrQueueAnnotationDelete(opts: { bookId: string; url: string }) {
  try {
    const res = await postJson(opts.url, "DELETE", null);
    if (res.ok) return { queued: false };
    if (res.status >= 500) throw new Error("SERVER_ERROR");
    return { queued: false };
  } catch (e) {
    if (!isOfflineLikeError(e)) throw e;
    await queueAnnotationDelete(opts);
    return { queued: true };
  }
}

