export type IdbStoreName = "offlineQueue" | "offlineProgress" | "offlineEpubIndex";

type OpenDbOpts = {
  name: string;
  version: number;
  onUpgrade: (db: IDBDatabase, oldVersion: number) => void;
};

function openDb(opts: OpenDbOpts): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(opts.name, opts.version);
    req.onupgradeneeded = () => {
      try {
        opts.onUpgrade(req.result, req.transaction?.db?.version ?? 0);
      } catch (e) {
        reject(e);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB_OPEN_FAILED"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IDB_TX_ABORT"));
    tx.onerror = () => reject(tx.error ?? new Error("IDB_TX_ERROR"));
  });
}

export type OfflineDb = {
  get<T>(store: IdbStoreName, key: IDBValidKey): Promise<T | undefined>;
  put<T>(store: IdbStoreName, value: T, key?: IDBValidKey): Promise<void>;
  delete(store: IdbStoreName, key: IDBValidKey): Promise<void>;
  getAll<T>(store: IdbStoreName): Promise<T[]>;
  clear(store: IdbStoreName): Promise<void>;
};

const DB_NAME = "shelf_offline";
const DB_VERSION = 1;

export async function getOfflineDb(): Promise<OfflineDb> {
  const db = await openDb({
    name: DB_NAME,
    version: DB_VERSION,
    onUpgrade: (db) => {
      if (!db.objectStoreNames.contains("offlineQueue")) {
        const s = db.createObjectStore("offlineQueue", { keyPath: "id" });
        s.createIndex("byBookId", "bookId", { unique: false });
        s.createIndex("byCreatedAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains("offlineProgress")) {
        db.createObjectStore("offlineProgress", { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains("offlineEpubIndex")) {
        db.createObjectStore("offlineEpubIndex", { keyPath: "bookId" });
      }
    },
  });

  const api: OfflineDb = {
    async get<T>(store: IdbStoreName, key: IDBValidKey): Promise<T | undefined> {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(key);
      const out = await new Promise<unknown>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as unknown);
        req.onerror = () => reject(req.error ?? new Error("IDB_GET_FAILED"));
      });
      await txDone(tx);
      return out as T | undefined;
    },
    async put<T>(store: IdbStoreName, value: T, key?: IDBValidKey): Promise<void> {
      const tx = db.transaction(store, "readwrite");
      const req =
        key == null ? tx.objectStore(store).put(value) : tx.objectStore(store).put(value, key);
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("IDB_PUT_FAILED"));
      });
      await txDone(tx);
    },
    async delete(store: IdbStoreName, key: IDBValidKey): Promise<void> {
      const tx = db.transaction(store, "readwrite");
      const req = tx.objectStore(store).delete(key);
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("IDB_DELETE_FAILED"));
      });
      await txDone(tx);
    },
    async getAll<T>(store: IdbStoreName): Promise<T[]> {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      const out = await new Promise<unknown[]>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as unknown[]);
        req.onerror = () => reject(req.error ?? new Error("IDB_GETALL_FAILED"));
      });
      await txDone(tx);
      return out as T[];
    },
    async clear(store: IdbStoreName): Promise<void> {
      const tx = db.transaction(store, "readwrite");
      const req = tx.objectStore(store).clear();
      await new Promise<void>((resolve, reject) => {
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error ?? new Error("IDB_CLEAR_FAILED"));
      });
      await txDone(tx);
    },
  };

  return api;
}
