"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { BookOpen, Loader2, Search } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { createTagAction, deleteTagAction, updateTagAction } from "./actions";

export type AdminTagRow = {
  id: string;
  name: string;
  color: string;
  bookCount: number;
};

const DEFAULT_HEX = "#777169";

type SortMode = "name-asc" | "name-desc" | "books-asc" | "books-desc";

function isValidHexColor(s: string) {
  return /^#[0-9a-fA-F]{6}$/.test(s.trim());
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Pick black or white label color for readability on arbitrary hex background. */
function contrastLabelColor(bgHex: string): "#000000" | "#ffffff" {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#000000";
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb.r);
  const g = lin(rgb.g);
  const b = lin(rgb.b);
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.55 ? "#000000" : "#ffffff";
}

function TagPill({ name, color }: { name: string; color: string }) {
  const fg = contrastLabelColor(color);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-medium leading-snug tracking-wide ring-1 ring-black/10 dark:ring-white/15"
      style={{ backgroundColor: color, color: fg }}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

function ColorFields({
  hexValue,
  onHexChange,
  disabled,
  idPrefix,
}: {
  hexValue: string;
  onHexChange: (next: string) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const pickerValue = isValidHexColor(hexValue) ? hexValue.trim() : DEFAULT_HEX;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <label
          htmlFor={`${idPrefix}-hex`}
          className="text-eleven-muted block text-[13px] font-medium tracking-wide"
        >
          Hex
        </label>
        <Input
          id={`${idPrefix}-hex`}
          value={hexValue}
          onChange={(e) => onHexChange(e.target.value)}
          placeholder={DEFAULT_HEX}
          disabled={disabled}
          spellCheck={false}
          className="font-mono text-[13px] tracking-wide"
        />
      </div>
      <div className="space-y-1">
        <span
          id={`${idPrefix}-picker-label`}
          className="text-eleven-muted block text-[13px] font-medium tracking-wide"
        >
          Aperçu
        </span>
        <div className="flex h-9 items-center">
          <input
            type="color"
            aria-labelledby={`${idPrefix}-picker-label`}
            value={pickerValue}
            onChange={(e) => onHexChange(e.target.value)}
            disabled={disabled}
            className="size-9 cursor-pointer overflow-hidden rounded-lg border border-(--eleven-border-subtle) bg-background p-0 shadow-eleven-button-white motion-reduce:transition-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
          />
        </div>
      </div>
    </div>
  );
}

function enterDelayStyle(index: number): CSSProperties {
  const ms = Math.min(index, 11) * 35;
  return { "--shelf-enter-delay": `${ms}ms` } as CSSProperties;
}

type PendingAction = "create" | "update" | "delete";

export function AdminTagsClient({ initialRows }: { initialRows: AdminTagRow[] }) {
  const [rows, setRows] = useState<AdminTagRow[]>(initialRows);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<null | PendingAction>(null);
  const actionBusy = pending !== null;

  const [error, setError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({ name: "", color: DEFAULT_HEX });
  const [editDraft, setEditDraft] = useState<null | { id: string; name: string; color: string }>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<null | { id: string; name: string }>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name-asc");

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fr");
    const list = q
      ? rows.filter((r) => r.name.toLocaleLowerCase("fr").includes(q))
      : [...rows];

    list.sort((a, b) => {
      switch (sortMode) {
        case "name-desc":
          return b.name.localeCompare(a.name, "fr", { sensitivity: "base" });
        case "books-asc":
          return a.bookCount - b.bookCount || a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
        case "books-desc":
          return b.bookCount - a.bookCount || a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
        case "name-asc":
        default:
          return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      }
    });
    return list;
  }, [rows, query, sortMode]);

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

    setPending("create");
    startTransition(() => {
      void (async () => {
        try {
          const res = await createTagAction({ name, color });
          if (res.ok) {
            upsertRow(res.tag);
            setCreateDraft({ name: "", color: DEFAULT_HEX });
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        } finally {
          setPending(null);
        }
      })();
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

    setPending("update");
    startTransition(() => {
      void (async () => {
        try {
          const res = await updateTagAction(payload);
          if (res.ok) upsertRow(res.tag);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        } finally {
          setPending(null);
        }
      })();
    });
  }

  function onConfirmDelete() {
    if (!confirmDelete) return;
    setError(null);
    const payload = { tagId: confirmDelete.id };
    setConfirmDelete(null);

    setPending("delete");
    startTransition(() => {
      void (async () => {
        try {
          const res = await deleteTagAction(payload);
          if (res.ok) removeRow(payload.tagId);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erreur");
        } finally {
          setPending(null);
        }
      })();
    });
  }

  const emptyLibrary = rows.length === 0;
  const emptyFilter = !emptyLibrary && filteredSorted.length === 0;

  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="animate-in fade-in slide-in-from-top-1 rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-900 duration-200 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 motion-reduce:animate-none"
        >
          {error}
        </div>
      )}

      <section
        className={cn(
          "admin-tags-panel space-y-4 rounded-2xl border border-(--eleven-border-subtle) bg-card p-5 shadow-eleven-card sm:p-6",
        )}
      >
        <div>
          <h3 className="eleven-display-section text-lg text-foreground">Nouveau tag</h3>
          <p className="text-eleven-muted eleven-body-airy mt-1 text-sm">
            Nom unique insensible à la casse. Couleur au format #RRGGBB.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-[min(100%,220px)] flex-1 space-y-1 sm:max-w-sm">
            <label htmlFor="tag-create-name" className="text-eleven-muted text-[13px] font-medium tracking-wide">
              Nom
            </label>
            <Input
              id="tag-create-name"
              value={createDraft.name}
              onChange={(e) => setCreateDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="ex: to-read"
              disabled={actionBusy}
              className="eleven-body-airy"
            />
          </div>
          <div className="min-w-[min(100%,280px)] flex-1">
            <ColorFields
              idPrefix="tag-create"
              hexValue={createDraft.color}
              onHexChange={(color) => setCreateDraft((d) => ({ ...d, color }))}
              disabled={actionBusy}
            />
          </div>
          <Button
            type="button"
            variant="blackPill"
            size="default"
            disabled={actionBusy || !createDraft.name.trim()}
            onClick={onCreate}
            className="motion-reduce:transition-none"
          >
            {pending === "create" ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            Créer
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-eleven-muted eleven-body-airy tracking-wide">
              {filteredSorted.length} / {rows.length} tag{rows.length === 1 ? "" : "s"}
            </span>
            {query.trim() ? (
              <span className="text-muted-foreground text-xs">(filtrés)</span>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-[min(100%,240px)] sm:w-64">
              <Search
                className="text-eleven-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par nom…"
                aria-label="Filtrer les tags par nom"
                className="eleven-body-airy h-9 rounded-xl pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="tag-sort" className="text-eleven-muted sr-only sm:not-sr-only sm:text-[13px]">
                Trier
              </label>
              <select
                id="tag-sort"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="border-input bg-background eleven-body-airy h-9 min-w-[10.5rem] rounded-xl border px-3 text-sm shadow-xs outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
              >
                <option value="name-asc">Nom A → Z</option>
                <option value="name-desc">Nom Z → A</option>
                <option value="books-asc">Livres (croissant)</option>
                <option value="books-desc">Livres (décroissant)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-2xl border border-(--eleven-border-subtle) shadow-eleven-card md:block">
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/80 supports-backdrop-filter:backdrop-blur-sm sticky top-0 z-10 border-b border-(--eleven-border-subtle)">
                <tr>
                  <th className="text-foreground px-4 py-3 text-[13px] font-medium tracking-wide">Nom</th>
                  <th className="text-foreground px-4 py-3 text-[13px] font-medium tracking-wide">Couleur</th>
                  <th className="text-foreground px-4 py-3 text-[13px] font-medium tracking-wide">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3.5 opacity-70" aria-hidden />
                      Livres
                    </span>
                  </th>
                  <th className="text-foreground w-[1%] px-4 py-3 text-right text-[13px] font-medium tracking-wide whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((t, index) => (
                  <tr
                    key={t.id}
                    style={enterDelayStyle(index)}
                    className={cn(
                      "shelf-item-enter border-t border-(--eleven-border-subtle) transition-colors duration-200 motion-reduce:transition-none",
                      "hover:bg-muted/20",
                    )}
                  >
                    <td className="px-4 py-3 align-middle">
                      <TagPill name={t.name} color={t.color} />
                    </td>
                    <td className="text-eleven-muted px-4 py-3 align-middle">
                      <span className="font-mono text-[13px] tracking-wide">{t.color}</span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 align-middle tabular-nums">{t.bookCount}</td>
                    <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionBusy}
                          className="motion-reduce:transition-none"
                          onClick={() => setEditDraft({ id: t.id, name: t.name, color: t.color })}
                        >
                          Éditer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionBusy || t.bookCount > 0}
                          className="motion-reduce:transition-none"
                          onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
                          title={t.bookCount > 0 ? "Retire d’abord ce tag des livres." : "Supprimer"}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {emptyLibrary && (
                  <tr>
                    <td className="text-eleven-muted eleven-body-airy px-4 py-10 text-center" colSpan={4}>
                      Aucun tag pour l’instant. Crée-en un ci-dessus.
                    </td>
                  </tr>
                )}
                {emptyFilter && (
                  <tr>
                    <td className="text-eleven-muted eleven-body-airy px-4 py-10 text-center" colSpan={4}>
                      Aucun tag ne correspond à « {query.trim()} ».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <ul className="flex flex-col gap-3 md:hidden">
          {filteredSorted.map((t, index) => (
            <li
              key={t.id}
              style={enterDelayStyle(index)}
              className={cn(
                "shelf-item-enter rounded-2xl border border-(--eleven-border-subtle) bg-card p-4 shadow-eleven-card",
                "transition-[transform,box-shadow] duration-200 motion-reduce:transition-none",
                "hover:-translate-y-px hover:shadow-eleven-button-white motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-eleven-card",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <TagPill name={t.name} color={t.color} />
                  <p className="text-eleven-muted font-mono text-[13px] tracking-wide">{t.color}</p>
                  <p className="text-muted-foreground eleven-body-airy flex items-center gap-1.5 text-sm">
                    <BookOpen className="size-3.5 shrink-0 opacity-70" aria-hidden />
                    <span className="tabular-nums">{t.bookCount}</span> livre{t.bookCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-row flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy}
                    onClick={() => setEditDraft({ id: t.id, name: t.name, color: t.color })}
                  >
                    Éditer
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionBusy || t.bookCount > 0}
                    onClick={() => setConfirmDelete({ id: t.id, name: t.name })}
                    title={t.bookCount > 0 ? "Retire d’abord ce tag des livres." : "Supprimer"}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {emptyLibrary && (
            <li className="text-eleven-muted eleven-body-airy rounded-2xl border border-dashed border-(--eleven-border-subtle) bg-muted/20 px-4 py-10 text-center text-sm">
              Aucun tag pour l’instant. Crée-en un ci-dessus.
            </li>
          )}
          {emptyFilter && (
            <li className="text-eleven-muted eleven-body-airy rounded-2xl border border-dashed border-(--eleven-border-subtle) bg-muted/20 px-4 py-10 text-center text-sm">
              Aucun tag ne correspond à « {query.trim()} ».
            </li>
          )}
        </ul>
      </section>

      <Dialog open={Boolean(editDraft)} onOpenChange={(v) => (!v ? setEditDraft(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="eleven-display-section text-xl font-light">Éditer un tag</DialogTitle>
            <DialogDescription>Nom unique + couleur hex.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="tag-edit-name" className="text-eleven-muted text-[13px] font-medium tracking-wide">
                Nom
              </label>
              <Input
                id="tag-edit-name"
                value={editDraft?.name ?? ""}
                onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                disabled={actionBusy}
                className="eleven-body-airy"
              />
            </div>
            <ColorFields
              idPrefix="tag-edit"
              hexValue={editDraft?.color ?? ""}
              onHexChange={(color) => setEditDraft((d) => (d ? { ...d, color } : d))}
              disabled={actionBusy}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={actionBusy} onClick={() => setEditDraft(null)}>
              Annuler
            </Button>
            <Button
              variant="blackPill"
              disabled={actionBusy || !editDraft?.name.trim()}
              onClick={onSaveEdit}
            >
              {pending === "update" ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmDelete)}
        onOpenChange={(v) => (!v ? setConfirmDelete(null) : undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="eleven-display-section text-xl font-light">Supprimer ?</DialogTitle>
            <DialogDescription>
              {confirmDelete ? (
                <>
                  Le tag <span className="text-foreground font-medium">{confirmDelete.name}</span> sera supprimé.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={actionBusy} onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button variant="destructive" disabled={actionBusy} onClick={onConfirmDelete}>
              {pending === "delete" ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
