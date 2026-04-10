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
import { GripVerticalIcon, PencilIcon, PlusIcon, SmilePlusIcon, Trash2Icon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

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
  type: "manual" | "dynamic" | "favorites" | "reading" | "read";
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
    case "reading":
    case "read":
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
    <div className="shelf-item-enter col-span-full rounded-2xl border border-dashed border-(--eleven-border-subtle) bg-muted/15 px-4 py-8 text-center">
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
                <div className="shadow-eleven-button-white relative aspect-[2/3] w-10 overflow-hidden rounded-sm bg-card ring-1 ring-black/10 transition-transform duration-300 ease-out will-change-transform group-hover/plank:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/plank:translate-y-0 sm:w-11 dark:ring-white/10">
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
  entranceIndex = 0,
}: {
  shelf: ShelfListItem;
  disabled?: boolean;
  onEdit: (s: ShelfListItem) => void;
  onDelete: (s: ShelfListItem) => void;
  /** Staggered entrance order within the current grid (motion-safe). */
  entranceIndex?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shelf.id,
    disabled: Boolean(disabled),
  });

  const delayMs = Math.min(entranceIndex, 20) * 48;
  const style: React.CSSProperties = {
    ...({
      "--shelf-enter-delay": `${delayMs}ms`,
    } as React.CSSProperties),
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "shelf-item-enter h-full overflow-hidden transition-shadow duration-200 ease-out hover:shadow-eleven-button-white motion-reduce:hover:shadow-eleven-card",
        isDragging && "shadow-eleven-warm",
      )}
    >
      <div className="relative">
        <Link
          href={`/shelves/${shelf.id}`}
          className="group/plank focus-visible:ring-ring/50 block rounded-t-2xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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

          {shelf.type !== "favorites" && shelf.type !== "reading" && shelf.type !== "read" && (
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

/** Curated shelf icons — single grapheme picks only */
const SHELF_ICON_EMOJIS = [
  "📚",
  "📖",
  "📕",
  "📗",
  "📘",
  "📙",
  "📓",
  "📔",
  "📝",
  "🔖",
  "⭐",
  "✨",
  "🌟",
  "💫",
  "📌",
  "🎯",
  "🏷️",
  "❤️",
  "🧡",
  "💜",
  "💚",
  "💙",
  "🖤",
  "📦",
  "🗂️",
  "📑",
  "🔮",
  "🎓",
  "☕",
  "🌙",
  "🌿",
  "🏠",
  "🎨",
  "🎭",
  "🎵",
  "🌊",
  "🔥",
  "🍂",
  "🕯️",
] as const;

function ShelfNameWithEmojiField({
  name,
  icon,
  onNameChange,
  onIconChange,
  disabled,
}: {
  name: string;
  icon: string;
  onNameChange: (value: string) => void;
  onIconChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const trimmed = icon.trim();
  const preview = trimmed ? [...trimmed][0] ?? trimmed.slice(0, 2) : null;
  const selectedEmoji = preview ?? "";

  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs">Nom</div>
      <div
        className={cn(
          "focus-within:border-ring focus-within:ring-ring/50 flex h-9 min-w-0 rounded-xl border border-input bg-transparent transition-colors focus-within:ring-3",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <PopoverPrimitive.Root modal={false} open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-11 shrink-0 items-center justify-center border-r border-input text-xl leading-none transition-colors outline-none focus-visible:bg-muted/40"
              aria-label="Choisir un emoji pour l’étagère"
              aria-expanded={pickerOpen}
            >
              {preview ? (
                <span className="select-none" aria-hidden>
                  {preview}
                </span>
              ) : (
                <SmilePlusIcon className="size-5 opacity-70" strokeWidth={1.5} aria-hidden />
              )}
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={12}
              onOpenAutoFocus={(e) => e.preventDefault()}
              className={cn(
                // 8×size-9 + 7×gap-0.5 + paddings ≈ 20.4rem — 18rem caused horizontal overflow
                "bg-popover text-popover-foreground shadow-eleven-card data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 z-[200] w-[min(20.5rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] origin-(--radix-popover-content-transform-origin) rounded-2xl border border-(--eleven-border-subtle) p-2 duration-100 outline-none",
              )}
            >
              <div
                className="grid max-h-[14rem] grid-cols-8 gap-0.5 overflow-x-hidden overflow-y-auto p-1"
                role="listbox"
                aria-label="Emojis"
              >
                {SHELF_ICON_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="option"
                    aria-selected={selectedEmoji === emoji}
                    className="hover:bg-accent/80 flex size-9 items-center justify-center rounded-lg text-lg transition-transform hover:scale-110 aria-selected:bg-accent/50 active:scale-95"
                    onClick={() => {
                      onIconChange(emoji);
                      setPickerOpen(false);
                    }}
                  >
                    <span className="select-none">{emoji}</span>
                  </button>
                ))}
              </div>
              <div className="border-t border-(--eleven-border-subtle) pt-2">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60 w-full rounded-lg px-2 py-1.5 text-xs transition-colors"
                  onClick={() => {
                    onIconChange("");
                    setPickerOpen(false);
                  }}
                >
                  Aucune icône
                </button>
              </div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={disabled}
          placeholder="Ma liste de lecture"
          className="eleven-body-airy h-9 flex-1 rounded-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0"
          aria-label="Nom de l’étagère"
        />
      </div>
    </div>
  );
}

export function ShelvesPageClient({ initialShelves }: { initialShelves: ShelfListItem[] }) {
  const router = useRouter();
  const [shelves, setShelves] = React.useState<ShelfListItem[]>(initialShelves);
  const [busy, startTransition] = React.useTransition();

  const systemShelves = shelves.filter(
    (s) => s.type === "favorites" || s.type === "reading" || s.type === "read",
  );
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
      <div
        className="shelf-item-enter flex flex-wrap items-center justify-between gap-2"
        style={{ "--shelf-enter-delay": "72ms" } as React.CSSProperties}
      >
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
                systemShelves.map((s, i) => (
                  <SortableShelfCard
                    key={s.id}
                    shelf={s}
                    disabled
                    entranceIndex={i}
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
                  manualShelves.map((s, i) => (
                    <SortableShelfCard
                      key={s.id}
                      shelf={s}
                      entranceIndex={i}
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
                  dynamicShelves.map((s, i) => (
                    <SortableShelfCard
                      key={s.id}
                      shelf={s}
                      entranceIndex={i}
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

            <ShelfNameWithEmojiField
              name={draft.name}
              icon={draft.icon}
              disabled={busy}
              onNameChange={(value) => setDraft((d) => ({ ...d, name: value }))}
              onIconChange={(value) => setDraft((d) => ({ ...d, icon: value }))}
            />

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
            <ShelfNameWithEmojiField
              name={draft.name}
              icon={draft.icon}
              disabled={busy}
              onNameChange={(value) => setDraft((d) => ({ ...d, name: value }))}
              onIconChange={(value) => setDraft((d) => ({ ...d, icon: value }))}
            />

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
