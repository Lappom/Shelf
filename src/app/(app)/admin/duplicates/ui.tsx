"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ignoreDuplicatePairAction,
  mergeDuplicatePairAction,
  mergeDuplicatePairsBatchAction,
} from "./actions";

export type AdminDuplicateBook = {
  id: string;
  title: string;
  authors: string[];
  format: string;
  coverUrl: string | null;
};

export type AdminDuplicateRow = {
  id: string;
  kind: "hash" | "fuzzy";
  status: "open" | "ignored" | "merged";
  score: number | null;
  lastScannedAt: string;
  mergedIntoBookId: string | null;
  bookA: AdminDuplicateBook;
  bookB: AdminDuplicateBook;
};

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatAuthors(authors: string[]) {
  return authors.length ? authors.join(", ") : "—";
}

function fmtScore(score: number | null) {
  if (score == null) return "—";
  return score.toFixed(3);
}

export function AdminDuplicatesClient({ initialRows }: { initialRows: AdminDuplicateRow[] }) {
  const [rows, setRows] = useState<AdminDuplicateRow[]>(initialRows);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"all" | "hash" | "fuzzy">("all");
  const [status, setStatus] = useState<"all" | "open" | "ignored" | "merged">("open");
  const [threshold, setThreshold] = useState<string>("0.70");
  const [confirm, setConfirm] = useState<
    | null
    | { type: "ignore"; pair: AdminDuplicateRow }
    | { type: "merge"; pair: AdminDuplicateRow; primary: "A" | "B" }
    | { type: "merge-all"; primary: "A" | "B"; pairIds: string[] }
  >(null);
  const [batchInfo, setBatchInfo] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (mode !== "all" && r.kind !== mode) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, mode, status]);

  const openPairsInFilter = useMemo(
    () => filtered.filter((r) => r.status === "open"),
    [filtered],
  );

  async function runScan(scanMode: "hash" | "fuzzy") {
    setError(null);
    const body =
      scanMode === "hash"
        ? { mode: "hash" as const }
        : {
            mode: "fuzzy" as const,
            fuzzyThreshold: Number(threshold),
          };

    const res = await fetch("/api/admin/scan-duplicates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

    if (!res?.ok) {
      const json = (await res?.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error ?? "Scan failed");
    }

    // Refresh page data in simplest way: reload.
    window.location.reload();
  }

  function onScan(scanMode: "hash" | "fuzzy") {
    startTransition(async () => {
      try {
        await runScan(scanMode);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  async function ignorePair(pairId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("pairId", pairId);
    await ignoreDuplicatePairAction(fd);
    setRows((prev) => prev.map((r) => (r.id === pairId ? { ...r, status: "ignored" } : r)));
  }

  async function mergePair(pair: AdminDuplicateRow, primary: "A" | "B") {
    setError(null);
    const primaryBookId = primary === "A" ? pair.bookA.id : pair.bookB.id;
    const absorbedBookId = primary === "A" ? pair.bookB.id : pair.bookA.id;
    const fd = new FormData();
    fd.set("pairId", pair.id);
    fd.set("primaryBookId", primaryBookId);
    fd.set("absorbedBookId", absorbedBookId);
    await mergeDuplicatePairAction(fd);
    setRows((prev) =>
      prev.map((r) =>
        r.id === pair.id ? { ...r, status: "merged", mergedIntoBookId: primaryBookId } : r,
      ),
    );
  }

  const confirmTitle =
    confirm?.type === "ignore"
      ? "Ignorer cette paire ?"
      : confirm?.type === "merge"
        ? "Merger ces livres ?"
        : confirm?.type === "merge-all"
          ? "Merger toutes les paires ouvertes affichées ?"
          : "";

  const confirmDescription =
    confirm?.type === "ignore"
      ? "La paire passera en statut ignored et ne sera plus proposée en open."
      : confirm?.type === "merge"
        ? "Le livre absorbé sera soft-deleted. Les relations (étagères/tags/annotations/progress/recos) seront transférées vers le livre primaire."
        : confirm?.type === "merge-all"
          ? `Chaque fusion utilisera la colonne ${confirm.primary === "A" ? "A" : "B"} comme livre conservé (primaire). Les paires déjà ignorées ou fusionnées dans la liste sont exclues. Les fusions s’exécutent une par une : si un livre a déjà été absorbé, les paires suivantes qui le référencent peuvent échouer.`
          : "";

  const confirmActionText =
    confirm?.type === "ignore"
      ? "Ignorer"
      : confirm?.type === "merge"
        ? "Merger"
        : confirm?.type === "merge-all"
          ? `Merger ${confirm.pairIds.length} paire(s)`
          : "OK";

  async function onConfirm() {
    if (!confirm) return;
    const local = confirm;
    setConfirm(null);
    startTransition(async () => {
      try {
        setBatchInfo(null);
        if (local.type === "ignore") await ignorePair(local.pair.id);
        if (local.type === "merge") await mergePair(local.pair, local.primary);
        if (local.type === "merge-all") {
          const fd = new FormData();
          fd.set(
            "payload",
            JSON.stringify({ pairIds: local.pairIds, primarySide: local.primary }),
          );
          const res = await mergeDuplicatePairsBatchAction(fd);
          const primarySide = local.primary;
          setRows((prev) =>
            prev.map((r) =>
              res.mergedPairIds.includes(r.id)
                ? {
                    ...r,
                    status: "merged" as const,
                    mergedIntoBookId: primarySide === "A" ? r.bookA.id : r.bookB.id,
                  }
                : r,
            ),
          );
          const failHint =
            res.failed.length > 0
              ? ` Échecs : ${res.failed
                  .slice(0, 8)
                  .map((f) => f.message)
                  .join(" · ")}${res.failed.length > 8 ? "…" : ""}`
              : "";
          if (res.failed.length > 0) {
            setError(
              `${res.merged} fusion(s), ${res.skipped} ignorée(s) (statut ou introuvable), ${res.failed.length} erreur(s).${failHint}`,
            );
          } else {
            setError(null);
            setBatchInfo(
              `${res.merged} paire(s) fusionnée(s).` +
                (res.skipped > 0 ? ` ${res.skipped} ignorée(s).` : ""),
            );
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {batchInfo && !error && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {batchInfo}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Scan</h2>
            <p className="text-muted-foreground text-sm">
              Hash = fichiers identiques. Fuzzy = similarité titre+auteurs (pg_trgm).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={busy} onClick={() => onScan("hash")}>
              Scanner hash
            </Button>
            <div className="flex items-center gap-2">
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                inputMode="decimal"
                className="h-9 w-24"
                placeholder="0.70"
                aria-label="Seuil fuzzy"
              />
              <Button variant="outline" disabled={busy} onClick={() => onScan("fuzzy")}>
                Scanner fuzzy
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Résultats</h2>
            <p className="text-muted-foreground text-sm">{filtered.length} paire(s)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={status === "open" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setStatus("open")}
            >
              Open
            </Button>
            <Button
              variant={status === "ignored" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setStatus("ignored")}
            >
              Ignored
            </Button>
            <Button
              variant={status === "merged" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setStatus("merged")}
            >
              Merged
            </Button>
            <Button
              variant={status === "all" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setStatus("all")}
            >
              Tous
            </Button>

            <div className="bg-border w-px self-stretch" />

            <Button
              variant={mode === "all" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setMode("all")}
            >
              All
            </Button>
            <Button
              variant={mode === "hash" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setMode("hash")}
            >
              Hash
            </Button>
            <Button
              variant={mode === "fuzzy" ? "default" : "outline"}
              disabled={busy}
              onClick={() => setMode("fuzzy")}
            >
              Fuzzy
            </Button>

            <div className="bg-border w-px self-stretch" />

            <Button
              variant="secondary"
              disabled={busy || openPairsInFilter.length === 0}
              onClick={() =>
                setConfirm({
                  type: "merge-all",
                  primary: "A",
                  pairIds: openPairsInFilter.map((p) => p.id),
                })
              }
            >
              Merger tout (open)
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium">A</th>
                <th className="px-3 py-2 font-medium">B</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">Dernier scan</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-(--eleven-border-subtle)">
                  <td className="px-3 py-2">{p.kind}</td>
                  <td className="text-muted-foreground px-3 py-2">{fmtScore(p.score)}</td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="font-medium">{p.bookA.title}</div>
                      <div className="text-muted-foreground">{formatAuthors(p.bookA.authors)}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="font-medium">{p.bookB.title}</div>
                      <div className="text-muted-foreground">{formatAuthors(p.bookB.authors)}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2">{p.status}</td>
                  <td className="text-muted-foreground px-3 py-2">{formatWhen(p.lastScannedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.status === "open" && (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirm({ type: "ignore", pair: p })}
                          >
                            Ignorer
                          </Button>
                          <Button
                            variant="default"
                            disabled={busy}
                            onClick={() => setConfirm({ type: "merge", pair: p, primary: "A" })}
                          >
                            Merger (A)
                          </Button>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => setConfirm({ type: "merge", pair: p, primary: "B" })}
                          >
                            Merger (B)
                          </Button>
                        </>
                      )}
                      <Button asChild variant="outline" disabled={busy}>
                        <Link href={`/admin/duplicates/${p.id}`}>Voir</Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td className="text-muted-foreground px-3 py-3" colSpan={7}>
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={Boolean(confirm)} onOpenChange={(v) => (!v ? setConfirm(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          {confirm?.type === "merge-all" && (
            <div className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-muted-foreground text-sm">Livre primaire :</span>
              <Button
                type="button"
                size="sm"
                variant={confirm.primary === "A" ? "default" : "outline"}
                disabled={busy}
                onClick={() => setConfirm({ ...confirm, primary: "A" })}
              >
                Colonne A
              </Button>
              <Button
                type="button"
                size="sm"
                variant={confirm.primary === "B" ? "default" : "outline"}
                disabled={busy}
                onClick={() => setConfirm({ ...confirm, primary: "B" })}
              >
                Colonne B
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              Annuler
            </Button>
            <Button disabled={busy} onClick={onConfirm}>
              {busy ? "…" : confirmActionText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
