"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { clearOfflineLocalState } from "@/lib/offline/cleanup";
import {
  listIndexedEpubs,
  purgeIndexedEpub,
  type OfflineEpubIndexRow,
} from "@/lib/offline/epubIndex";
import { isEpubCached } from "@/lib/offline/pwaCache";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  current?: { bookId: string; fileUrl: string };
};

const LIMIT_KEY = "shelf_offline_limit_mb";

function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let x = Math.max(0, n);
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${Math.round(x * 10) / 10} ${units[i]}`;
}

export function OfflineManagerDialog({ open, onOpenChange, current }: Props) {
  const [storage, setStorage] = React.useState<{ usage?: number; quota?: number } | null>(null);
  const [rows, setRows] = React.useState<OfflineEpubIndexRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [limitMb, setLimitMb] = React.useState<number>(() => {
    if (typeof window === "undefined") return 500;
    const v = Number(window.localStorage.getItem(LIMIT_KEY));
    return Number.isFinite(v) && v > 0 ? v : 500;
  });
  const [currentCached, setCurrentCached] = React.useState<boolean | null>(null);

  const refresh = React.useCallback(async () => {
    const [list, estimate, cached] = await Promise.all([
      listIndexedEpubs().catch(() => [] as OfflineEpubIndexRow[]),
      navigator.storage?.estimate?.().catch(() => null),
      current?.fileUrl ? isEpubCached(current.fileUrl).catch(() => false) : Promise.resolve(null),
    ]);
    setRows(list);
    setStorage(estimate ? { usage: estimate.usage, quota: estimate.quota } : null);
    setCurrentCached(cached);
  }, [current?.fileUrl]);

  React.useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const usage = storage?.usage ?? null;
  const quota = storage?.quota ?? null;
  const limitBytes = Math.max(1, limitMb) * 1024 * 1024;

  const overLimit = usage != null && usage > limitBytes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Offline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Stockage</div>
            <div className="text-muted-foreground mt-1 text-sm">
              Utilisé: <span className="text-foreground">{formatBytes(usage)}</span> · Quota:{" "}
              <span className="text-foreground">{formatBytes(quota)}</span>
            </div>
            <div className="text-muted-foreground mt-2 text-sm">
              Limite locale (soft):{" "}
              <span className={overLimit ? "text-destructive font-medium" : "text-foreground"}>
                {limitMb} MB
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={String(limitMb)}
                inputMode="numeric"
                onChange={(e) => {
                  const next = Math.max(1, Math.min(50_000, Number(e.target.value)));
                  if (!Number.isFinite(next)) return;
                  setLimitMb(next);
                  window.localStorage.setItem(LIMIT_KEY, String(next));
                }}
              />
              <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
                Rafraîchir
              </Button>
            </div>
            {overLimit ? (
              <div className="text-destructive mt-2 text-sm">
                Vous dépassez la limite locale. Pensez à purger des livres mis en cache.
              </div>
            ) : null}
          </div>

          {current ? (
            <div className="rounded-2xl border p-4">
              <div className="text-sm font-medium">Livre courant</div>
              <div className="text-muted-foreground mt-1 text-sm">
                Cache:{" "}
                <span className="text-foreground">
                  {currentCached == null ? "—" : currentCached ? "Disponible" : "Pas encore"}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    (async () => {
                      await purgeIndexedEpub({ bookId: current.bookId, fileUrl: current.fileUrl });
                      await refresh();
                    })()
                      .catch(() => undefined)
                      .finally(() => setBusy(false));
                  }}
                >
                  Purger ce livre
                </Button>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Livres mis en cache</div>
            {rows.length ? (
              <div className="mt-3 space-y-2">
                {rows.slice(0, 50).map((r) => (
                  <div
                    key={r.bookId}
                    className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.bookId}</div>
                      <div className="text-muted-foreground text-xs">
                        Vu: {new Date(r.lastSeenAt).toLocaleString("fr-FR")}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        (async () => {
                          await purgeIndexedEpub({ bookId: r.bookId, fileUrl: r.fileUrl });
                          await refresh();
                        })()
                          .catch(() => undefined)
                          .finally(() => setBusy(false));
                      }}
                    >
                      Purger
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground mt-2 text-sm">
                Aucun livre indexé pour l’instant.
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              clearOfflineLocalState()
                .then(() => refresh())
                .catch(() => undefined)
                .finally(() => setBusy(false));
            }}
          >
            Tout purger
          </Button>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
