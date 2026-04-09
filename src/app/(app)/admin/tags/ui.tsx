"use client";

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
import { createTagAction, deleteTagAction, updateTagAction } from "./actions";

export type AdminTagRow = {
  id: string;
  name: string;
  color: string;
  bookCount: number;
};

function isValidHexColor(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s.trim());
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-3 rounded-sm border border-(--eleven-border-subtle)"
      style={{ background: color }}
      aria-label={color}
      title={color}
    />
  );
}

export function AdminTagsClient({ initialRows }: { initialRows: AdminTagRow[] }) {
  const [rows, setRows] = useState<AdminTagRow[]>(initialRows);
  const [busy, startTransition] = useTransition();

  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({ name: "", color: "#777169" });
  const [editDraft, setEditDraft] = useState<null | { id: string; name: string; color: string }>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; name: string }>(null);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  }, [rows]);

  function upsertRow(tag: { id: string; name: string; color: string }) {
    setRows((prev) => {
      const existing = prev.find((r) => r.id === tag.id);
      if (!existing) return [...prev, { ...tag, bookCount: 0 }];
      return prev.map((r) => (r.id === tag.id ? { ...r, name: tag.name, color: tag.color } : r));
    });
  }

  function removeRow(tagId: string) {
    setRows((prev) => prev.filter((r) => r.id !== tagId));
  }

  function onCreate() {
    setError(null);
    const name = createDraft.name.trim();
    const color = createDraft.color.trim();
    if (!name) return;
    if (!isValidHexColor(color)) {
      setError("Couleur invalide (format attendu: #RRGGBB).");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createTagAction({ name, color });
        if (res.ok) {
          upsertRow(res.tag);
          setCreateDraft({ name: "", color });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function onSaveEdit() {
    if (!editDraft) return;
    setError(null);
    const name = editDraft.name.trim();
    const color = editDraft.color.trim();
    if (!name) return;
    if (!isValidHexColor(color)) {
      setError("Couleur invalide (format attendu: #RRGGBB).");
      return;
    }

    const payload = { tagId: editDraft.id, name, color };
    setEditDraft(null);

    startTransition(async () => {
      try {
        const res = await updateTagAction(payload);
        if (res.ok) upsertRow(res.tag);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function onConfirmDelete() {
    if (!confirmDelete) return;
    setError(null);
    const payload = { tagId: confirmDelete.id };
    setConfirmDelete(null);

    startTransition(async () => {
      try {
        const res = await deleteTagAction(payload);
        if (res.ok) removeRow(payload.tagId);
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

      <section className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] space-y-1">
            <div className="text-muted-foreground text-xs">Nom</div>
            <Input
              value={createDraft.name}
              onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="ex: to-read"
              disabled={busy}
            />
          </div>
          <div className="min-w-[160px] space-y-1">
            <div className="text-muted-foreground text-xs">Couleur</div>
            <Input
              value={createDraft.color}
              onChange={(e) => setCreateDraft((d) => ({ ...d, color: e.target.value }))}
              placeholder="#777169"
              disabled={busy}
            />
          </div>
          <Button onClick={onCreate} disabled={busy || !createDraft.name.trim()}>
            Créer
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Tags</h2>
            <p className="text-muted-foreground text-sm">{rows.length} tag(s)</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Couleur</th>
                <th className="px-3 py-2 font-medium">Livres</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((t) => (
                <tr key={t.id} className="border-t border-(--eleven-border-subtle)">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ColorSwatch color={t.color} />
                      <span className="text-muted-foreground">{t.color}</span>
                    </div>
                  </td>
                  <td className="text-muted-foreground px-3 py-2">{t.bookCount}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditDraft({ id: t.id, name: t.name, color: t.color })}
                      >
                        Éditer
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || t.bookCount > 0}
                        onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
                        title={t.bookCount > 0 ? "Retire d’abord ce tag des livres." : "Supprimer"}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {!sortedRows.length && (
                <tr>
                  <td className="text-muted-foreground px-3 py-3" colSpan={4}>
                    Aucun tag.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={Boolean(editDraft)} onOpenChange={(v) => (!v ? setEditDraft(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Éditer un tag</DialogTitle>
            <DialogDescription>Nom unique + couleur hex.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Nom</div>
              <Input
                value={editDraft?.name ?? ""}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                disabled={busy}
              />
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Couleur</div>
              <Input
                value={editDraft?.color ?? ""}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, color: e.target.value } : d))}
                disabled={busy}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setEditDraft(null)}>
              Annuler
            </Button>
            <Button disabled={busy || !editDraft?.name.trim()} onClick={onSaveEdit}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => (!v ? setConfirmDelete(null) : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ?</DialogTitle>
            <DialogDescription>
              {confirmDelete ? (
                <>
                  Le tag <span className="font-medium">{confirmDelete.name}</span> sera supprimé.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button disabled={busy} onClick={onConfirmDelete}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
