"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addBookTagAction, removeBookTagAction } from "@/app/(app)/book/[id]/tagActions";

export type BookTagItem = { id: string; name: string; color: string };

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full border border-(--eleven-border-subtle)"
      style={{ background: color }}
      aria-label={color}
      title={color}
    />
  );
}

export function BookTagsPanel({
  bookId,
  canEdit,
  initialSelected,
  allTags,
}: {
  bookId: string;
  canEdit: boolean;
  initialSelected: BookTagItem[];
  allTags: BookTagItem[];
}) {
  const [selected, setSelected] = useState<BookTagItem[]>(initialSelected);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string>("");

  const selectedIds = useMemo(() => new Set(selected.map((t) => t.id)), [selected]);
  const available = useMemo(
    () => allTags.filter((t) => !selectedIds.has(t.id)),
    [allTags, selectedIds],
  );

  function onAdd() {
    if (!canEdit) return;
    setError(null);
    const tagId = pick;
    if (!tagId) return;

    const tag = allTags.find((t) => t.id === tagId);
    if (!tag) return;

    startTransition(async () => {
      try {
        const res = await addBookTagAction({ bookId, tagId });
        if (res.ok) {
          setSelected((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" })));
          setPick("");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  function onRemove(tagId: string) {
    if (!canEdit) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await removeBookTagAction({ bookId, tagId });
        if (res.ok) {
          setSelected((prev) => prev.filter((t) => t.id !== tagId));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  const hasAny = selected.length > 0;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {hasAny ? (
          selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-2 rounded-full border border-(--eleven-border-subtle) bg-muted/20 px-2.5 py-1 text-sm"
            >
              <ColorDot color={t.color} />
              <span className="font-medium">{t.name}</span>
              {canEdit && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => onRemove(t.id)}
                  disabled={busy}
                  aria-label={`Retirer ${t.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))
        ) : (
          <div className="text-muted-foreground text-sm">Aucun tag.</div>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            disabled={busy}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-[220px] rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3 disabled:opacity-50"
          >
            <option value="">Ajouter un tag…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" disabled={busy || !pick} onClick={onAdd}>
            Ajouter
          </Button>
        </div>
      )}
    </div>
  );
}

