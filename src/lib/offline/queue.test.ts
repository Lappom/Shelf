import { describe, expect, it, vi } from "vitest";

type StoreName = "offlineQueue" | "offlineProgress" | "offlineEpubIndex";

function storeKeyFromValue(store: StoreName, value: unknown) {
  const v = value as { bookId?: unknown; id?: unknown };
  const raw =
    store === "offlineProgress" || store === "offlineEpubIndex" ? v.bookId : v.id;
  return String(raw ?? "");
}

function createMemoryDb() {
  const stores: Record<StoreName, Map<string, unknown>> = {
    offlineQueue: new Map(),
    offlineProgress: new Map(),
    offlineEpubIndex: new Map(),
  };

  return {
    get: vi.fn(async (store: StoreName, key: unknown) => stores[store].get(String(key))),
    put: vi.fn(async (store: StoreName, value: unknown) => {
      const k = storeKeyFromValue(store, value);
      stores[store].set(k, value);
    }),
    delete: vi.fn(async (store: StoreName, key: unknown) => {
      stores[store].delete(String(key));
    }),
    getAll: vi.fn(async (store: StoreName) => Array.from(stores[store].values())),
    clear: vi.fn(async (store: StoreName) => {
      stores[store].clear();
    }),
    _stores: stores,
  };
}

vi.mock("@/lib/offline/idb", () => {
  const db = createMemoryDb();
  return {
    getOfflineDb: vi.fn(async () => db),
  };
});

describe("offline queue", () => {
  it("queues progress update when fetch fails", async () => {
    const { offlineOrQueueProgress } = await import("./queue");
    // @ts-expect-error test override
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const res = await offlineOrQueueProgress({
      bookId: "b1",
      url: "/api/progress/b1",
      body: { progress: 0.5, currentCfi: "cfi", status: "reading" },
    });
    expect(res.queued).toBe(true);

    const { getOfflineDb } = await import("@/lib/offline/idb");
    const db = await getOfflineDb();
    const rows = await db.getAll("offlineProgress");
    expect(rows).toHaveLength(1);
    expect(rows[0].bookId).toBe("b1");
  });

  it("flushes queued progress and deletes it on success", async () => {
    const { queueProgressUpdate, flushOfflineQueue } = await import("./queue");
    // @ts-expect-error test override
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 }));

    await queueProgressUpdate({
      bookId: "b2",
      url: "/api/progress/b2",
      body: { progress: 0.2, currentCfi: "cfi", status: "reading" },
    });

    const out = await flushOfflineQueue();
    expect(out.sent).toBeGreaterThanOrEqual(1);

    const { getOfflineDb } = await import("@/lib/offline/idb");
    const db = await getOfflineDb();
    const rows = await db.getAll("offlineProgress");
    expect(rows).toHaveLength(0);
  });

  it("queues annotation create when offline and flushes later", async () => {
    const { offlineOrQueueAnnotationCreate, flushOfflineQueue } = await import("./queue");
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new TypeError("Failed to fetch");
      })
      .mockImplementationOnce(async () => new Response("{}", { status: 201 }));
    // @ts-expect-error test override
    globalThis.fetch = fetchMock;

    const res = await offlineOrQueueAnnotationCreate({
      bookId: "b3",
      url: "/api/books/b3/annotations",
      body: { type: "bookmark", cfiRange: "cfi" },
    });
    expect(res.queued).toBe(true);

    const out = await flushOfflineQueue();
    expect(out.sent).toBeGreaterThanOrEqual(1);
  });
});
