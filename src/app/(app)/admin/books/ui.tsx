"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadMoreAdminBooksAction, purgeBookAction } from "./actions";

export type AdminBookRow = {
  id: string;
  title: string;
  authors: string[];
  format: string;
  deletedAt: string | null;
  createdAt: string;
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
    const { book } = confirm;
    setConfirm(null);

    startTransition(async () => {
      try {
        if (confirm.type === "soft_delete") await softDelete(book.id);
        if (confirm.type === "purge") await purge(book.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Actifs</h2>
            <p className="text-muted-foreground text-sm">{active.length} livre(s)</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Titre</th>
                <th className="px-3 py-2 font-medium">Auteurs</th>
                <th className="px-3 py-2 font-medium">Format</th>
                <th className="px-3 py-2 font-medium">Ajouté</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((b) => (
                <tr key={b.id} className="border-t border-(--eleven-border-subtle)">
                  <td className="px-3 py-2">
                    <Link className="underline underline-offset-3" href={`/book/${b.id}`}>
                      {b.title}
                    </Link>
                  </td>
                  <td className="text-muted-foreground px-3 py-2">{formatAuthors(b.authors)}</td>
                  <td className="px-3 py-2">{b.format}</td>
                  <td className="text-muted-foreground px-3 py-2">{formatWhen(b.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {b.format === "epub" && (
                        <Button variant="outline" size="sm" disabled={busy} asChild>
                          <Link href={`/admin/books/${b.id}/metadata-merge`}>
                            Merge métadonnées
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm({ type: "soft_delete", book: b })}
                      >
                        Soft delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!active.length && (
                <tr>
                  <td className="text-muted-foreground px-3 py-3" colSpan={5}>
                    Aucun livre actif.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Supprimés (soft delete)</h2>
          <p className="text-muted-foreground text-sm">{deleted.length} livre(s)</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Titre</th>
                <th className="px-3 py-2 font-medium">Auteurs</th>
                <th className="px-3 py-2 font-medium">Format</th>
                <th className="px-3 py-2 font-medium">Supprimé</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deleted.map((b) => (
                <tr key={b.id} className="border-t border-(--eleven-border-subtle)">
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{b.title}</span>
                  </td>
                  <td className="text-muted-foreground px-3 py-2">{formatAuthors(b.authors)}</td>
                  <td className="px-3 py-2">{b.format}</td>
                  <td className="text-muted-foreground px-3 py-2">{formatWhen(b.deletedAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="default"
                      disabled={busy}
                      onClick={() => setConfirm({ type: "purge", book: b })}
                    >
                      Purger
                    </Button>
                  </td>
                </tr>
              ))}
              {!deleted.length && (
                <tr>
                  <td className="text-muted-foreground px-3 py-3" colSpan={5}>
                    Aucun livre supprimé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" disabled={busy} onClick={loadMore}>
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
