import { getOfflineDb } from "@/lib/offline/idb";
import { clearAllPwaCaches } from "@/lib/offline/pwaCache";

export async function clearOfflineLocalState() {
  await Promise.allSettled([
    clearAllPwaCaches(),
    (async () => {
      const db = await getOfflineDb();
      await db.clear("offlineQueue");
      await db.clear("offlineProgress");
      await db.clear("offlineEpubIndex");
    })(),
  ]);
}
