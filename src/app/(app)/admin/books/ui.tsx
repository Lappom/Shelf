"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { BookOpen, CopyIcon, GitMerge, MoreHorizontal, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { loadMoreAdminBooksAction, purgeBookAction } from "./actions";

export type AdminBookRow = {
  id: string;
  title: string;
  authors: string[];
  format: string;
  deletedAt: string | null;
  createdAt: string;
};

const STAGGER_CAP = 14;
const STAGGER_MS = 35;

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatAuthors(authors: string[]) {
  return authors.length ? authors.join(", ") : "—";
}

function rowMatchesFilter(book: AdminBookRow, q: string, formatFilter: string) {
  if (formatFilter !== "all" && book.format !== formatFilter) return false;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = `${book.title} ${book.authors.join(" ")} ${book.format} ${book.id}`.toLowerCase();
  return hay.includes(needle);
}

function staggerStyle(index: number): React.CSSProperties {
  return {
    ["--shelf-enter-delay" as string]: `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`,
  } as React.CSSProperties;
}

function BookRowActions({
  book,
  tab,
  busy,
  onSoftDelete,
  onPurge,
}: {
  book: AdminBookRow;
  tab: "active" | "deleted";
  busy: boolean;
  onSoftDelete: (b: AdminBookRow) => void;
  onPurge: (b: AdminBookRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="rounded-eleven-pill shadow-eleven-button-white transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.03] active:scale-[0.98]"
          disabled={busy}
          aria-label={`Actions pour ${book.title}`}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem asChild>
          <Link href={`/book/${book.id}`} className="flex cursor-pointer items-center gap-2">
            <BookOpen className="size-4 opacity-70" aria-hidden />
            Ouvrir le livre
          </Link>
        </DropdownMenuItem>
        {tab === "active" && book.format === "epub" && (
          <DropdownMenuItem asChild>
            <Link
              href={`/admin/books/${book.id}/metadata-merge`}
              className="flex cursor-pointer items-center gap-2"
            >
              <GitMerge className="size-4 opacity-70" aria-hidden />
              Merge métadonnées
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            void navigator.clipboard.writeText(book.id);
          }}
        >
          <CopyIcon className="size-4 opacity-70" aria-hidden />
          Copier l&apos;ID
        </DropdownMenuItem>
        {tab === "active" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={(e) => {
                e.preventDefault();
                onSoftDelete(book);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Soft delete
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={(e) => {
                e.preventDefault();
                onPurge(book);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Purger
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminBooksClient({
  initialRows,
  initialNextCursor,
}: {
  initialRows: AdminBookRow[];
  initialNextCursor: string | null;
}) {
  const [rows, setRows] = useState<AdminBookRow[]>(initialRows);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [busy, startTransition] = useTransition();
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [confirm, setConfirm] = useState<
    null | { type: "soft_delete"; book: AdminBookRow } | { type: "purge"; book: AdminBookRow }
  >(null);
  const [error, setError] = useState<string | null>(null);

  const { active, deleted } = useMemo(() => {
    const a: AdminBookRow[] = [];
    const d: AdminBookRow[] = [];
    for (const r of rows) (r.deletedAt ? d : a).push(r);
    return { active: a, deleted: d };
  }, [rows]);

  const formats = useMemo(() => {
    const s = new Set(rows.map((r) => r.format));
    return [...s].sort((x, y) => x.localeCompare(y));
  }, [rows]);

  const effectiveFormatFilter = useMemo(() => {
    if (formatFilter === "all") return "all";
    return formats.includes(formatFilter) ? formatFilter : "all";
  }, [formatFilter, formats]);

  const filteredActive = useMemo(
    () => active.filter((b) => rowMatchesFilter(b, search, effectiveFormatFilter)),
    [active, search, effectiveFormatFilter],
  );

  const filteredDeleted = useMemo(
    () => deleted.filter((b) => rowMatchesFilter(b, search, effectiveFormatFilter)),
    [deleted, search, effectiveFormatFilter],
  );

  const list = tab === "active" ? filteredActive : filteredDeleted;
  const bucket = tab === "active" ? active : deleted;
  const trulyEmpty = bucket.length === 0;
  const filteredEmpty = list.length === 0 && !trulyEmpty;

  async function softDelete(bookId: string) {
    setError(null);
    const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const json = (await res?.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error ?? "Soft delete failed");
    }

    setRows((prev) =>
      prev.map((r) => (r.id === bookId ? { ...r, deletedAt: new Date().toISOString() } : r)),
    );
  }

  async function purge(bookId: string) {
    setError(null);
    const fd = new FormData();
    fd.set("bookId", bookId);
    await purgeBookAction(fd);
    setRows((prev) => prev.filter((r) => r.id !== bookId));
  }

  const confirmTitle =
    confirm?.type === "soft_delete"
      ? "Supprimer (soft delete) ?"
      : confirm?.type === "purge"
        ? "Purger définitivement ?"
        : "";

  const confirmDescription =
    confirm?.type === "soft_delete"
      ? "Le livre sera masqué (deleted_at). Les fichiers restent dans le storage."
      : confirm?.type === "purge"
        ? "Cette action supprime le(s) fichier(s) du storage puis supprime les données en base. Irréversible."
        : "";

  const confirmActionText =
    confirm?.type === "soft_delete" ? "Soft delete" : confirm?.type === "purge" ? "Purger" : "OK";

  function loadMore() {
    if (!nextCursor || busy) return;
    startTransition(async () => {
      setError(null);
      const res = await loadMoreAdminBooksAction({ cursor: nextCursor });
      if (!res.ok) {
        setError(
          res.error === "INVALID_CURSOR" ? "Pagination invalide." : "Chargement impossible.",
        );
        return;
      }
      setRows((prev) => [...prev, ...res.rows]);
      setNextCursor(res.nextCursor);
    });
  }

  async function onConfirm() {
    if (!confirm) return;
    const payload = confirm;
    const { book } = payload;
    setConfirm(null);

    startTransition(async () => {
      try {
        if (payload.type === "soft_delete") await softDelete(book.id);
        if (payload.type === "purge") await purge(book.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const emptyMessage = trulyEmpty
    ? tab === "active"
      ? "Aucun livre actif."
      : "Aucun livre supprimé."
    : "Aucun résultat pour cette recherche ou ce filtre.";

  const tableCardClass =
    "shadow-eleven-card overflow-hidden rounded-2xl border border-(--eleven-border-subtle) bg-card";

  return (
    <div className="space-y-6">
      {error ? (
        <div
          role="alert"
          className="animate-in fade-in slide-in-from-top-2 eleven-body-airy rounded-2xl border border-red-200/80 bg-red-50 px-3 py-2 text-sm text-red-800 duration-200 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
        >
          {error}
        </div>
      ) : null}

      <div className="bg-background/90 sticky top-0 z-20 -mx-1 mb-1 flex flex-col gap-3 border-b border-(--eleven-border-subtle) px-1 py-3 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
          <label className="sr-only" htmlFor="admin-books-search">
            Rechercher un livre
          </label>
          <Input
            id="admin-books-search"
            type="search"
            placeholder="Rechercher par titre, auteur, format ou ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-eleven-warm bg-background/80"
            autoComplete="off"
          />
        </div>

        <div
          role="tablist"
          aria-label="Statut des livres"
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={tab === "active"}
            variant={tab === "active" ? "default" : "outline"}
            size="sm"
            className={cn(
              "rounded-eleven-pill transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
              tab === "active" ? "shadow-eleven-warm" : "shadow-eleven-button-white",
            )}
            onClick={() => setTab("active")}
          >
            Actifs ({active.length})
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={tab === "deleted"}
            variant={tab === "deleted" ? "default" : "outline"}
            size="sm"
            className={cn(
              "rounded-eleven-pill transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
              tab === "deleted" ? "shadow-eleven-warm" : "shadow-eleven-button-white",
            )}
            onClick={() => setTab("deleted")}
          >
            Supprimés ({deleted.length})
          </Button>
        </div>

        {formats.length > 0 ? (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filtrer par format"
          >
            <span className="text-eleven-muted eleven-body-airy text-xs font-medium">Format</span>
            <Button
              type="button"
              size="sm"
              variant={effectiveFormatFilter === "all" ? "secondary" : "ghost"}
              className="rounded-eleven-pill h-8 px-3 text-xs"
              onClick={() => setFormatFilter("all")}
            >
              Tous
            </Button>
            {formats.map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={effectiveFormatFilter === f ? "secondary" : "ghost"}
                className="rounded-eleven-pill h-8 px-3 font-mono text-xs"
                onClick={() => setFormatFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div key={tab} className="admin-books-panel space-y-4">
        {/* Desktop table */}
        <div
          className={cn("hidden max-h-[min(70vh,800px)] overflow-auto md:block", tableCardClass)}
        >
          <table className="eleven-body-airy w-full min-w-[640px] text-left text-[0.94rem]">
            <thead className="bg-muted/50 sticky top-0 z-10 border-b border-(--eleven-border-subtle) supports-backdrop-filter:backdrop-blur-xs">
              <tr>
                <th className="px-3 py-2.5 font-medium">Titre</th>
                <th className="px-3 py-2.5 font-medium">Auteurs</th>
                <th className="px-3 py-2.5 font-medium">Format</th>
                <th className="px-3 py-2.5 font-medium">
                  {tab === "active" ? "Ajouté" : "Supprimé"}
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b, i) => (
                <tr
                  key={b.id}
                  className="shelf-item-enter hover:bg-muted/30 border-t border-(--eleven-border-subtle) transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:shadow-[var(--eleven-shadow-outline)]"
                  style={staggerStyle(i)}
                >
                  <td className="px-3 py-2.5">
                    {tab === "active" ? (
                      <Link
                        className="text-foreground hover:decoration-foreground underline decoration-(--eleven-border-subtle) underline-offset-4 transition-colors"
                        href={`/book/${b.id}`}
                      >
                        {b.title}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{b.title}</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5">{formatAuthors(b.authors)}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{b.format}</td>
                  <td className="text-muted-foreground px-3 py-2.5 text-xs">
                    {tab === "active" ? formatWhen(b.createdAt) : formatWhen(b.deletedAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <BookRowActions
                      book={b}
                      tab={tab}
                      busy={busy}
                      onSoftDelete={(book) => setConfirm({ type: "soft_delete", book })}
                      onPurge={(book) => setConfirm({ type: "purge", book })}
                    />
                  </td>
                </tr>
              ))}
              {list.length === 0 ? (
                <tr>
                  <td className="text-muted-foreground px-3 py-8 text-center" colSpan={5}>
                    {emptyMessage}
                    {filteredEmpty ? (
                      <span className="mt-1 block text-xs">
                        Essayez d&apos;élargir la recherche ou le filtre format.
                      </span>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {list.map((b, i) => (
            <article
              key={b.id}
              className={cn(
                "shelf-item-enter flex flex-col gap-3 p-4 transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
                tableCardClass,
                "hover:shadow-[var(--eleven-shadow-card)]",
              )}
              style={staggerStyle(i)}
            >
              <div className="min-w-0">
                {tab === "active" ? (
                  <Link
                    href={`/book/${b.id}`}
                    className="eleven-body-airy text-foreground hover:decoration-foreground text-base font-medium underline decoration-transparent underline-offset-2 transition-colors"
                  >
                    {b.title}
                  </Link>
                ) : (
                  <p className="text-muted-foreground text-base font-medium">{b.title}</p>
                )}
                <p className="text-eleven-muted mt-1 text-xs">{formatAuthors(b.authors)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-eleven-pill bg-muted/40 border border-(--eleven-border-subtle) px-2 py-0.5 font-mono">
                  {b.format}
                </span>
                <span className="text-muted-foreground">
                  {tab === "active" ? formatWhen(b.createdAt) : formatWhen(b.deletedAt)}
                </span>
              </div>
              <div className="flex justify-end border-t border-(--eleven-border-subtle) pt-3">
                <BookRowActions
                  book={b}
                  tab={tab}
                  busy={busy}
                  onSoftDelete={(book) => setConfirm({ type: "soft_delete", book })}
                  onPurge={(book) => setConfirm({ type: "purge", book })}
                />
              </div>
            </article>
          ))}
          {list.length === 0 ? (
            <div
              className={cn(
                "text-muted-foreground eleven-body-airy rounded-2xl border border-dashed border-(--eleven-border-subtle) px-4 py-10 text-center text-sm",
              )}
            >
              {emptyMessage}
              {filteredEmpty ? (
                <span className="mt-2 block text-xs">
                  Essayez d&apos;élargir la recherche ou le filtre format.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={loadMore}
            className="rounded-eleven-pill shadow-eleven-button-white transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.02] active:scale-[0.98]"
          >
            {busy ? "Chargement…" : "Charger plus"}
          </Button>
        </div>
      ) : null}

      <Dialog open={Boolean(confirm)} onOpenChange={(v) => (!v ? setConfirm(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>

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
