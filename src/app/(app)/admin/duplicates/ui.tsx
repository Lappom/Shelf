"use client";

import Image from "next/image";
import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  coverToken: string | null;
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

const STAGGER_CAP = 16;
const STAGGER_MS = 40;

function coverImageSrc(bookId: string, coverUrl: string | null, coverToken: string | null) {
  if (!coverUrl) return null;
  if (coverToken) return `/api/books/${bookId}/cover?t=${encodeURIComponent(coverToken)}`;
  return `/api/books/${bookId}/cover`;
}

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

function statusLabel(s: AdminDuplicateRow["status"]) {
  switch (s) {
    case "open":
      return "Ouvert";
    case "ignored":
      return "Ignoré";
    case "merged":
      return "Fusionné";
    default:
      return s;
  }
}

function kindLabel(k: AdminDuplicateRow["kind"]) {
  return k === "hash" ? "Hash" : "Fuzzy";
}

function BookThumb({ book, className }: { book: AdminDuplicateBook; className?: string }) {
  const src = coverImageSrc(book.id, book.coverUrl, book.coverToken);
  if (!src) {
    return (
      <div
        className={cn(
          "bg-muted/40 text-eleven-muted flex shrink-0 items-center justify-center rounded-lg border border-(--eleven-border-subtle) text-[10px]",
          className ?? "h-[4.5rem] w-11",
        )}
      >
        —
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={44}
      height={66}
      sizes="44px"
      className={cn(
        "shrink-0 rounded-lg border border-(--eleven-border-subtle) object-cover",
        className ?? "h-[4.5rem] w-11",
      )}
    />
  );
}

function KindBadge({ kind }: { kind: AdminDuplicateRow["kind"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-(--eleven-border-subtle)",
        kind === "hash" ? "bg-secondary text-secondary-foreground" : "bg-muted/80 text-foreground",
      )}
    >
      {kindLabel(kind)}
    </span>
  );
}

function StatusBadge({ status }: { status: AdminDuplicateRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-(--eleven-border-subtle)",
        status === "open" && "bg-primary/10 text-foreground",
        status === "ignored" && "text-eleven-muted bg-muted/50",
        status === "merged" && "bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

type PillProps = {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

function FilterPill({ active, disabled, onClick, children }: PillProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-eleven-pill border px-3 py-1.5 text-xs transition-[box-shadow,background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        active
          ? "bg-secondary text-secondary-foreground shadow-eleven-card border-transparent"
          : "text-eleven-muted hover:text-foreground hover:bg-muted/50 border-(--eleven-border-subtle)",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {children}
    </button>
  );
}

export function AdminDuplicatesClient({ initialRows }: { initialRows: AdminDuplicateRow[] }) {
  const [rows, setRows] = useState<AdminDuplicateRow[]>(initialRows);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"all" | "hash" | "fuzzy">("all");
  const [status, setStatus] = useState<"all" | "open" | "ignored" | "merged">("open");
  const [threshold, setThreshold] = useState<string>("0.70");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<
    | null
    | { type: "ignore"; pair: AdminDuplicateRow }
    | { type: "merge"; pair: AdminDuplicateRow; primary: "A" | "B" }
    | { type: "merge-all"; primary: "A" | "B"; pairIds: string[] }
  >(null);
  const [batchInfo, setBatchInfo] = useState<string | null>(null);
  const [scanPending, setScanPending] = useState<"hash" | "fuzzy" | null>(null);

  const criteriaFiltered = useMemo(() => {
    return rows.filter((r) => {
      if (mode !== "all" && r.kind !== mode) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [rows, mode, status]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return criteriaFiltered;
    return criteriaFiltered.filter((r) => {
      const hay =
        `${r.bookA.title} ${r.bookB.title} ${r.bookA.authors.join(" ")} ${r.bookB.authors.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [criteriaFiltered, search]);

  const openPairsInFilter = useMemo(
    () => displayed.filter((r) => r.status === "open"),
    [displayed],
  );

  const listAnimKey = `${status}-${mode}-${search.trim()}`;

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

    window.location.reload();
  }

  function onScan(scanMode: "hash" | "fuzzy") {
    setScanPending(scanMode);
    startTransition(async () => {
      try {
        await runScan(scanMode);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
        setScanPending(null);
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
      ? "La paire passera en statut ignoré et ne sera plus proposée comme ouverte."
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
          fd.set("payload", JSON.stringify({ pairIds: local.pairIds, primarySide: local.primary }));
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
        <div
          className="shadow-eleven-card rounded-eleven-card flex gap-3 border border-red-200/80 bg-red-50/90 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="eleven-body-airy leading-relaxed">{error}</p>
        </div>
      )}
      {batchInfo && !error && (
        <div className="shadow-eleven-card rounded-eleven-card flex gap-3 border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="eleven-body-airy leading-relaxed">{batchInfo}</p>
        </div>
      )}

      <Card className="rounded-eleven-card admin-dup-panel-enter border-(--eleven-border-subtle)">
        <CardHeader className="border-b border-(--eleven-border-subtle) pb-4">
          <CardTitle>Scan des doublons</CardTitle>
          <CardDescription className="text-eleven-secondary eleven-body-airy">
            Hash = fichiers identiques. Fuzzy = similarité titre et auteurs (extension pg_trgm).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <p className="text-eleven-muted eleven-body-airy text-xs">
            Lancez un scan pour mettre à jour les paires détectées (la page se recharge ensuite).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-eleven-pill"
              disabled={busy}
              onClick={() => onScan("hash")}
            >
              {busy && scanPending === "hash" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Scanner hash
            </Button>
            <div className="flex items-center gap-2" suppressHydrationWarning>
              <Input
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                inputMode="decimal"
                className="eleven-body-airy h-9 w-24 rounded-xl border-(--eleven-border-subtle)"
                placeholder="0.70"
                aria-label="Seuil fuzzy"
              />
              <Button
                variant="outline"
                className="rounded-eleven-pill"
                disabled={busy}
                onClick={() => onScan("fuzzy")}
              >
                {busy && scanPending === "fuzzy" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Scanner fuzzy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h3 className="font-heading eleven-body-airy text-lg font-light">Résultats</h3>
            <p className="text-eleven-muted eleven-body-airy text-sm">
              {displayed.length} sur {criteriaFiltered.length} paire(s)
              {search.trim() ? " (recherche appliquée)" : ""}
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-xl">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par titre ou auteur…"
              className="eleven-body-airy h-10 rounded-xl border-(--eleven-border-subtle)"
              aria-label="Filtrer les paires"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <div className="text-eleven-muted mb-2 text-xs font-medium tracking-wide uppercase">
              Statut
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterPill
                active={status === "open"}
                disabled={busy}
                onClick={() => setStatus("open")}
              >
                Ouverts
              </FilterPill>
              <FilterPill
                active={status === "ignored"}
                disabled={busy}
                onClick={() => setStatus("ignored")}
              >
                Ignorés
              </FilterPill>
              <FilterPill
                active={status === "merged"}
                disabled={busy}
                onClick={() => setStatus("merged")}
              >
                Fusionnés
              </FilterPill>
              <FilterPill
                active={status === "all"}
                disabled={busy}
                onClick={() => setStatus("all")}
              >
                Tous
              </FilterPill>
            </div>
          </div>
          <div>
            <div className="text-eleven-muted mb-2 text-xs font-medium tracking-wide uppercase">
              Type
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterPill active={mode === "all"} disabled={busy} onClick={() => setMode("all")}>
                Tous les types
              </FilterPill>
              <FilterPill active={mode === "hash"} disabled={busy} onClick={() => setMode("hash")}>
                Hash
              </FilterPill>
              <FilterPill
                active={mode === "fuzzy"}
                disabled={busy}
                onClick={() => setMode("fuzzy")}
              >
                Fuzzy
              </FilterPill>
              <span className="bg-border hidden h-6 w-px sm:inline-block" aria-hidden />
              <Button
                variant="secondary"
                className="rounded-eleven-pill"
                disabled={busy || openPairsInFilter.length === 0}
                onClick={() =>
                  setConfirm({
                    type: "merge-all",
                    primary: "A",
                    pairIds: openPairsInFilter.map((p) => p.id),
                  })
                }
              >
                Merger tout ({openPairsInFilter.length})
              </Button>
            </div>
          </div>
        </div>

        <Card className="rounded-eleven-card admin-dup-panel-enter overflow-hidden border-(--eleven-border-subtle) p-0">
          {/* Desktop table */}
          <div key={listAnimKey} className="admin-dup-list-fade hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/80 text-eleven-muted sticky top-0 z-10 backdrop-blur-sm">
                <tr className="border-b border-(--eleven-border-subtle)">
                  <th className="px-3 py-3 text-xs font-medium">Type</th>
                  <th className="px-3 py-3 text-xs font-medium">Score</th>
                  <th className="px-3 py-3 text-xs font-medium">Livre A</th>
                  <th className="px-3 py-3 text-xs font-medium">Livre B</th>
                  <th className="px-3 py-3 text-xs font-medium">Statut</th>
                  <th className="px-3 py-3 text-xs font-medium">Dernier scan</th>
                  <th className="px-3 py-3 text-right text-xs font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((p, i) => (
                  <tr
                    key={p.id}
                    style={{
                      ["--admin-dup-delay" as string]: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`,
                    }}
                    className="admin-dup-row-enter hover:shadow-eleven-button-white border-b border-(--eleven-border-subtle) transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] last:border-b-0 hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-none"
                  >
                    <td className="px-3 py-3 align-middle">
                      <KindBadge kind={p.kind} />
                    </td>
                    <td className="text-eleven-muted px-3 py-3 align-middle tabular-nums">
                      {fmtScore(p.score)}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex gap-2">
                        <BookThumb book={p.bookA} />
                        <div className="min-w-0 space-y-0.5">
                          <div className="leading-snug font-medium">{p.bookA.title}</div>
                          <div className="text-eleven-muted text-xs leading-relaxed">
                            {formatAuthors(p.bookA.authors)}
                          </div>
                          <div className="text-eleven-muted text-[10px]">{p.bookA.format}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex gap-2">
                        <BookThumb book={p.bookB} />
                        <div className="min-w-0 space-y-0.5">
                          <div className="leading-snug font-medium">{p.bookB.title}</div>
                          <div className="text-eleven-muted text-xs leading-relaxed">
                            {formatAuthors(p.bookB.authors)}
                          </div>
                          <div className="text-eleven-muted text-[10px]">{p.bookB.format}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="text-eleven-muted px-3 py-3 align-middle text-xs">
                      {formatWhen(p.lastScannedAt)}
                    </td>
                    <td className="px-3 py-3 text-right align-middle">
                      <PairActionsMenu pair={p} busy={busy} onConfirm={setConfirm} />
                    </td>
                  </tr>
                ))}
                {!displayed.length && (
                  <tr>
                    <td className="text-eleven-muted px-3 py-8 text-center" colSpan={7}>
                      Aucun résultat pour ces filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div key={`m-${listAnimKey}`} className="admin-dup-list-fade space-y-3 p-3 md:hidden">
            {displayed.map((p, i) => (
              <Card
                key={p.id}
                size="sm"
                style={{
                  ["--admin-dup-delay" as string]: `${Math.min(i, STAGGER_CAP) * STAGGER_MS}ms`,
                }}
                className="admin-dup-card-enter shadow-eleven-card hover:shadow-eleven-button-white motion-reduce:hover:shadow-eleven-card rounded-xl border-(--eleven-border-subtle) transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <CardHeader className="flex-row items-start justify-between gap-2 border-b border-(--eleven-border-subtle) pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={p.kind} />
                    <StatusBadge status={p.status} />
                    <span className="text-eleven-muted text-xs tabular-nums">
                      score {fmtScore(p.score)}
                    </span>
                  </div>
                  <PairActionsMenu pair={p} busy={busy} onConfirm={setConfirm} align="end" />
                </CardHeader>
                <CardContent className="space-y-4 pt-3">
                  <div className="flex gap-3">
                    <BookThumb book={p.bookA} className="h-[5.5rem] w-[3.35rem]" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-eleven-muted text-[10px] font-medium tracking-wide uppercase">
                        A
                      </div>
                      <div className="leading-snug font-medium">{p.bookA.title}</div>
                      <div className="text-eleven-muted text-xs">
                        {formatAuthors(p.bookA.authors)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <BookThumb book={p.bookB} className="h-[5.5rem] w-[3.35rem]" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-eleven-muted text-[10px] font-medium tracking-wide uppercase">
                        B
                      </div>
                      <div className="leading-snug font-medium">{p.bookB.title}</div>
                      <div className="text-eleven-muted text-xs">
                        {formatAuthors(p.bookB.authors)}
                      </div>
                    </div>
                  </div>
                  <p className="text-eleven-muted text-xs">
                    Dernier scan : {formatWhen(p.lastScannedAt)}
                  </p>
                </CardContent>
              </Card>
            ))}
            {!displayed.length && (
              <p className="text-eleven-muted eleven-body-airy py-8 text-center text-sm">
                Aucun résultat pour ces filtres.
              </p>
            )}
          </div>
        </Card>
      </section>

      <Dialog open={Boolean(confirm)} onOpenChange={(v) => (!v ? setConfirm(null) : undefined)}>
        <DialogContent className="rounded-eleven-card border-(--eleven-border-subtle) sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription className="text-eleven-secondary eleven-body-airy">
              {confirmDescription}
            </DialogDescription>
          </DialogHeader>
          {confirm?.type === "merge-all" && (
            <div className="flex flex-wrap items-center gap-2 py-2">
              <span className="text-eleven-muted text-sm">Livre primaire :</span>
              <Button
                type="button"
                size="sm"
                variant={confirm.primary === "A" ? "default" : "outline"}
                className="rounded-eleven-pill"
                disabled={busy}
                onClick={() => setConfirm({ ...confirm, primary: "A" })}
              >
                Colonne A
              </Button>
              <Button
                type="button"
                size="sm"
                variant={confirm.primary === "B" ? "default" : "outline"}
                className="rounded-eleven-pill"
                disabled={busy}
                onClick={() => setConfirm({ ...confirm, primary: "B" })}
              >
                Colonne B
              </Button>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-eleven-pill"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Annuler
            </Button>
            <Button className="rounded-eleven-pill" disabled={busy} onClick={onConfirm}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmActionText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PairActionsMenu({
  pair,
  busy,
  onConfirm,
  align = "end",
}: {
  pair: AdminDuplicateRow;
  busy: boolean;
  onConfirm: Dispatch<
    SetStateAction<
      | null
      | { type: "ignore"; pair: AdminDuplicateRow }
      | { type: "merge"; pair: AdminDuplicateRow; primary: "A" | "B" }
      | { type: "merge-all"; primary: "A" | "B"; pairIds: string[] }
    >
  >;
  align?: "start" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-eleven-pill h-8 w-8 p-0"
          disabled={busy}
          aria-label="Actions pour cette paire"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-[12rem]">
        {pair.status === "open" && (
          <>
            <DropdownMenuItem
              onClick={() => onConfirm({ type: "ignore", pair })}
              className="cursor-pointer"
            >
              Ignorer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onConfirm({ type: "merge", pair, primary: "A" })}
              className="cursor-pointer"
            >
              Merger (garder A)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onConfirm({ type: "merge", pair, primary: "B" })}
              className="cursor-pointer"
            >
              Merger (garder B)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={`/admin/duplicates/${pair.id}`}>Voir le détail</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
