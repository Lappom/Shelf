"use client";

import * as React from "react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createShelfAction,
  deleteShelfAction,
  reorderShelvesAction,
  updateShelfAction,
} from "@/app/(app)/shelves/actions";

export type ShelfListItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: "manual" | "dynamic" | "favorites" | "reading";
  sortOrder: number;
  createdAt: string;
  booksCount: number | null;
};

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

function SortableShelfRow({
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
      className={cn("transition-shadow", isDragging && "shadow-eleven-warm")}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2">
            <span className="text-lg">
              {shelf.icon ?? (shelf.type === "dynamic" ? "🧩" : "📚")}
            </span>
            <span className="truncate">
              <Link className="underline-offset-4 hover:underline" href={`/shelves/${shelf.id}`}>
                {shelf.name}
              </Link>
            </span>
          </CardTitle>
          <CardDescription className="line-clamp-2">
            {shelf.description ||
              `${shelfTypeLabel(shelf.type)} • ${shelf.booksCount ?? "—"} livres`}
          </CardDescription>
        </div>

        <div className="flex items-center gap-1.5">
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
      </CardHeader>
      <CardContent className="py-3">
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-muted-foreground text-sm">
          {systemShelves.length ? `${systemShelves.length} système` : "—"} •{" "}
          {reorderableShelves.length} perso
        </div>

        <Button
          variant="warmStone"
          size="warm"
          onClick={() => {
            setDraft({ type: "manual", name: "", description: "", icon: "" });
            setCreateOpen(true);
          }}
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
            <div className="grid grid-cols-1 gap-3">
              {systemShelves.map((s) => (
                <SortableShelfRow
                  key={s.id}
                  shelf={s}
                  disabled
                  onEdit={() => {}}
                  onDelete={() => {}}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">
              Manuelles
            </div>
            <SortableContext
              items={manualShelves.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-3">
                {manualShelves.map((s) => (
                  <SortableShelfRow
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
                ))}
              </div>
            </SortableContext>
          </div>

          <div className="space-y-3">
            <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">
              Dynamiques
            </div>
            <SortableContext
              items={dynamicShelves.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid grid-cols-1 gap-3">
                {dynamicShelves.map((s) => (
                  <SortableShelfRow
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
                ))}
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
