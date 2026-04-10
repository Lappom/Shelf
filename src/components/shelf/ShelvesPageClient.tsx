"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createShelfAction,
  deleteShelfAction,
  reorderShelvesAction,
  updateShelfAction,
} from "@/app/(app)/shelves/actions";

export type ShelfCoverPreview = {
  id: string;
  coverUrl: string | null;
  coverToken: string | null;
};

export type ShelfListItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: "manual" | "dynamic" | "favorites" | "reading";
  sortOrder: number;
  createdAt: string;
  booksCount: number | null;
  previewCovers: ShelfCoverPreview[];
};

const SHELF_CARD_VISIBLE_COVERS = 7;

function coverImageSrc(bookId: string, coverUrl: string | null, coverToken: string | null) {
  if (!coverUrl) return null;
  if (coverToken) return `/api/books/${bookId}/cover?t=${encodeURIComponent(coverToken)}`;
  return `/api/books/${bookId}/cover`;
}

function shelfTypeLabel(t: ShelfListItem["type"]) {
  switch (t) {
    case "favorites":
      return "Système";
    case "reading":
      return "Système";
    case "manual":
      return "Manuelle";
    case "dynamic":
      return "Dynamique";
  }
}

function ShelfSectionEmpty({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-(--eleven-border-subtle) bg-muted/15 px-4 py-8 text-center">
      <p className="text-eleven-secondary eleven-body-airy text-sm">{message}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 rounded-eleven-pill"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function ShelfPlankBooks({ books }: { books: ShelfCoverPreview[] }) {
  const slice = books.slice(0, SHELF_CARD_VISIBLE_COVERS);
  const showPlaceholders = slice.length === 0;
  const placeholderCount = 6;

  return (
    <div className="from-secondary/40 relative overflow-hidden rounded-t-2xl border-b border-(--eleven-border-subtle) bg-gradient-to-b to-[color-mix(in_oklab,var(--secondary)_65%,var(--muted)))] px-1 pt-3 pb-0 dark:to-secondary/35">
      <div className="flex min-h-[6.75rem] items-end justify-center sm:min-h-[7.5rem]">
        <div className="flex max-w-full items-end justify-center px-1">
          {slice.map((b, i) => {
            const src = coverImageSrc(b.id, b.coverUrl, b.coverToken);
            const rot = i % 2 === 0 ? -3 : 3;
            return (
              <div
                key={b.id}
                className="relative z-[2] -ml-2.5 shrink-0 first:ml-0 sm:-ml-3"
                style={{ transform: `rotate(${rot}deg)` }}
              >
                <div className="shadow-eleven-button-white relative aspect-[2/3] w-10 overflow-hidden rounded-sm bg-card ring-1 ring-black/10 sm:w-11 dark:ring-white/10">
                  {src ? (
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized={!b.coverToken}
                    />
                  ) : (
                    <div className="bg-muted absolute inset-0" />
                  )}
                </div>
              </div>
            );
          })}
          {showPlaceholders
            ? Array.from({ length: placeholderCount }).map((_, i) => {
                const rot = i % 2 === 0 ? 2.5 : -2.5;
                const h = 3.25 + (i % 3) * 0.35;
                return (
                  <div
                    key={`ph-${i}`}
                    className="relative z-[1] -ml-2.5 shrink-0 first:ml-0 sm:-ml-3"
                    style={{ transform: `rotate(${rot}deg)` }}
                  >
                    <div
                      className="bg-muted/70 w-9 rounded-sm ring-1 ring-black/5 sm:w-10 dark:ring-white/10"
                      style={{ height: `${h}rem` }}
                    />
                  </div>
                );
              })
            : null}
        </div>
      </div>
      {/* Shelf lip / front edge */}
      <div
        className="from-foreground/15 to-foreground/30 dark:from-white/12 dark:to-white/6 mx-1 mb-2 h-2 rounded-t-sm bg-gradient-to-b shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
        aria-hidden
      />
    </div>
  );
}

function SortableShelfCard({
  shelf,
  disabled,
  onEdit,
  onDelete,
}: {
  shelf: ShelfListItem;
  disabled?: boolean;
  onEdit: (s: ShelfListItem) => void;
  onDelete: (s: ShelfListItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shelf.id,
    disabled: Boolean(disabled),
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "h-full overflow-hidden transition-shadow duration-200 hover:shadow-eleven-button-white",
        isDragging && "shadow-eleven-warm",
      )}
    >
      <div className="relative">
        <Link
          href={`/shelves/${shelf.id}`}
          className="focus-visible:ring-ring/50 block rounded-t-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label={`Ouvrir l’étagère ${shelf.name}`}
        >
          <ShelfPlankBooks books={shelf.previewCovers} />
          <div className="border-t border-(--eleven-border-subtle) px-4 pt-3 pb-2">
            <div className="font-heading eleven-body-airy flex items-start gap-2 pr-14 text-lg leading-tight font-light sm:text-xl">
              <span className="shrink-0 text-xl leading-none" aria-hidden>
                {shelf.icon ?? (shelf.type === "dynamic" ? "🧩" : "📚")}
              </span>
              <span className="text-foreground line-clamp-2">{shelf.name}</span>
            </div>
            <p className="text-eleven-secondary eleven-body-airy mt-1 line-clamp-2 text-sm">
              {shelf.description ||
                `${shelfTypeLabel(shelf.type)} • ${shelf.booksCount ?? "—"} livres`}
            </p>
          </div>
        </Link>

        <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-background/90 p-0.5 shadow-eleven-button-white backdrop-blur-sm dark:bg-background/80">
          {!disabled && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-grab active:cursor-grabbing"
              aria-label="Réordonner"
              {...attributes}
              {...listeners}
            >
              <GripVerticalIcon />
            </Button>
          )}

          {shelf.type !== "favorites" && shelf.type !== "reading" && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Éditer"
                onClick={() => onEdit(shelf)}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Supprimer"
                onClick={() => onDelete(shelf)}
              >
                <Trash2Icon />
              </Button>
            </>
          )}
        </div>
      </div>

      <CardContent className="pb-4 pt-2">
        <div className="text-eleven-muted eleven-body-airy flex items-center gap-2 text-xs">
          <span>{shelfTypeLabel(shelf.type)}</span>
          <span aria-hidden="true">•</span>
          <span>{shelf.booksCount ?? "—"} livres</span>
        </div>
      </CardContent>
    </Card>
  );
}

type ShelfDraft = {
  type: "manual" | "dynamic";
  name: string;
  description: string;
  icon: string;
};

function sanitizeEmojiOrText(s: string) {
  const v = s.trim();
  return v ? v.slice(0, 50) : "";
}

export function ShelvesPageClient({ initialShelves }: { initialShelves: ShelfListItem[] }) {
  const router = useRouter();
  const [shelves, setShelves] = React.useState<ShelfListItem[]>(initialShelves);
  const [busy, startTransition] = React.useTransition();

  const systemShelves = shelves.filter((s) => s.type === "favorites" || s.type === "reading");
  const reorderableShelves = shelves.filter((s) => s.type === "manual" || s.type === "dynamic");
  const manualShelves = reorderableShelves.filter((s) => s.type === "manual");
  const dynamicShelves = reorderableShelves.filter((s) => s.type === "dynamic");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const [draft, setDraft] = React.useState<ShelfDraft>({
    type: "manual",
    name: "",
    description: "",
    icon: "",
  });

  const [selected, setSelected] = React.useState<ShelfListItem | null>(null);

  function onDragEnd(ev: DragEndEvent) {
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId || activeId === overId) return;

    const oldIndexManual = manualShelves.findIndex((x) => x.id === activeId);
    const newIndexManual = manualShelves.findIndex((x) => x.id === overId);
    const oldIndexDynamic = dynamicShelves.findIndex((x) => x.id === activeId);
    const newIndexDynamic = dynamicShelves.findIndex((x) => x.id === overId);

    const inManual = oldIndexManual >= 0 && newIndexManual >= 0;
    const inDynamic = oldIndexDynamic >= 0 && newIndexDynamic >= 0;
    if (!inManual && !inDynamic) return;

    const nextManual = inManual
      ? arrayMove(manualShelves, oldIndexManual, newIndexManual)
      : manualShelves;
    const nextDynamic = inDynamic
      ? arrayMove(dynamicShelves, oldIndexDynamic, newIndexDynamic)
      : dynamicShelves;

    const nextReorderable = [...nextManual, ...nextDynamic];
    const nextAll = [...systemShelves, ...nextReorderable];
    setShelves(nextAll);

    startTransition(async () => {
      await reorderShelvesAction({ shelfIds: nextReorderable.map((x) => x.id) });
      router.refresh();
    });
  }

  async function doCreate() {
    startTransition(async () => {
      const res = await createShelfAction({
        type: draft.type,
        name: draft.name.trim(),
        description: draft.description.trim() ? draft.description.trim() : null,
        icon: sanitizeEmojiOrText(draft.icon) || null,
      });
      if (res.ok) {
        setCreateOpen(false);
        setDraft({ type: "manual", name: "", description: "", icon: "" });
        router.refresh();
        router.push(`/shelves/${res.shelfId}`);
      }
    });
  }

  async function doEdit() {
    if (!selected) return;
    startTransition(async () => {
      const res = await updateShelfAction({
        shelfId: selected.id,
        name: draft.name.trim(),
        description: draft.description.trim() ? draft.description.trim() : null,
        icon: sanitizeEmojiOrText(draft.icon) || null,
      });
      if (res.ok) {
        setEditOpen(false);
        setSelected(null);
        router.refresh();
      }
    });
  }

  async function doDelete() {
    if (!selected) return;
    startTransition(async () => {
      const res = await deleteShelfAction({ shelfId: selected.id });
      if (res.ok) {
        setDeleteOpen(false);
        setSelected(null);
        router.refresh();
      }
    });
  }

  function openCreateShelf(type: "manual" | "dynamic" = "manual") {
    setDraft({ type, name: "", description: "", icon: "" });
    setCreateOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-eleven-muted eleven-body-airy text-sm">
          {systemShelves.length ? `${systemShelves.length} système` : "—"} •{" "}
          {reorderableShelves.length} perso
        </div>

        <Button
          variant="warmStone"
          size="warm"
          onClick={() => openCreateShelf("manual")}
          disabled={busy}
        >
          <PlusIcon />
          Nouvelle étagère
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">
              Système
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {systemShelves.length === 0 ? (
                <ShelfSectionEmpty message="Aucune étagère système pour l’instant." />
              ) : (
                systemShelves.map((s) => (
                  <SortableShelfCard
                    key={s.id}
                    shelf={s}
                    disabled
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">
              Manuelles
            </div>
            <SortableContext
              items={manualShelves.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {manualShelves.length === 0 ? (
                  <ShelfSectionEmpty
                    message="Aucune étagère manuelle. Ajoute-en une pour organiser tes livres à la main."
                    actionLabel="Nouvelle étagère manuelle"
                    onAction={() => openCreateShelf("manual")}
                  />
                ) : (
                  manualShelves.map((s) => (
                    <SortableShelfCard
                      key={s.id}
                      shelf={s}
                      onEdit={(sh) => {
                        setSelected(sh);
                        setDraft({
                          type: sh.type === "dynamic" ? "dynamic" : "manual",
                          name: sh.name,
                          description: sh.description ?? "",
                          icon: sh.icon ?? "",
                        });
                        setEditOpen(true);
                      }}
                      onDelete={(sh) => {
                        setSelected(sh);
                        setDeleteOpen(true);
                      }}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </div>

          <div className="space-y-3">
            <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">
              Dynamiques
            </div>
            <SortableContext
              items={dynamicShelves.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {dynamicShelves.length === 0 ? (
                  <ShelfSectionEmpty
                    message="Aucune étagère dynamique. Les règles remplissent l’étagère automatiquement."
                    actionLabel="Nouvelle étagère dynamique"
                    onAction={() => openCreateShelf("dynamic")}
                  />
                ) : (
                  dynamicShelves.map((s) => (
                    <SortableShelfCard
                      key={s.id}
                      shelf={s}
                      onEdit={(sh) => {
                        setSelected(sh);
                        setDraft({
                          type: sh.type === "dynamic" ? "dynamic" : "manual",
                          name: sh.name,
                          description: sh.description ?? "",
                          icon: sh.icon ?? "",
                        });
                        setEditOpen(true);
                      }}
                      onDelete={(sh) => {
                        setSelected(sh);
                        setDeleteOpen(true);
                      }}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </div>
        </div>
      </DndContext>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle étagère</DialogTitle>
            <DialogDescription>Crée une étagère manuelle ou dynamique.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={draft.type === "manual" ? "blackPill" : "outline"}
                onClick={() => setDraft((d) => ({ ...d, type: "manual" }))}
                type="button"
              >
                Manuelle
              </Button>
              <Button
                variant={draft.type === "dynamic" ? "blackPill" : "outline"}
                onClick={() => setDraft((d) => ({ ...d, type: "dynamic" }))}
                type="button"
              >
                Dynamique
              </Button>
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Nom</div>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Emoji (optionnel)</div>
              <Input
                value={draft.icon}
                onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                placeholder="⭐"
              />
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Description (optionnel)</div>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button type="button" onClick={doCreate} disabled={busy || !draft.name.trim()}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Éditer l’étagère</DialogTitle>
            <DialogDescription>Nom, description et icône.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Nom</div>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Emoji (optionnel)</div>
              <Input
                value={draft.icon}
                onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Description (optionnel)</div>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button type="button" onClick={doEdit} disabled={busy || !draft.name.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l’étagère</DialogTitle>
            <DialogDescription>
              Cette action retire aussi tous ses liens livres↔étagère. Les livres ne sont pas
              supprimés.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              Annuler
            </Button>
            <Button variant="destructive" type="button" onClick={doDelete} disabled={busy}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
