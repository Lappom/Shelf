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
import { GripVerticalIcon, SaveIcon, SparklesIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  previewShelfRuleAction,
  reorderShelfBooksAction,
  updateShelfAction,
  updateShelfRuleAction,
} from "@/app/(app)/shelves/actions";

export type ShelfDetailShelf = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: "manual" | "dynamic" | "favorites" | "reading";
  createdAt: string;
  rules: unknown | null;
};

export type ShelfDetailBookRow = {
  id: string;
  title: string;
  authors: string[];
  format: "epub" | "physical" | "pdf" | "cbz" | "cbr" | "audiobook";
  addedAt: string;
  createdAt: string;
  shelfSortOrder: number;
};

type RuleMatch = "all" | "any";
type RuleField =
  | "language"
  | "format"
  | "page_count"
  | "added_at"
  | "authors"
  | "subjects"
  | "tags";
type RuleOp =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "after"
  | "before"
  | "has_any"
  | "has_all"
  | "is_empty"
  | "is_not_empty";

type RuleCondition = { field: RuleField; operator: RuleOp; value?: unknown };
type ShelfRuleDraft = { match: RuleMatch; conditions: RuleCondition[] };

const fieldOptions: Array<{ value: RuleField; label: string }> = [
  { value: "language", label: "Langue" },
  { value: "format", label: "Format" },
  { value: "page_count", label: "Pages" },
  { value: "added_at", label: "Ajouté le" },
  { value: "authors", label: "Auteurs" },
  { value: "subjects", label: "Sujets" },
  { value: "tags", label: "Tags" },
];

const operatorOptions: Array<{ value: RuleOp; label: string }> = [
  { value: "eq", label: "égal" },
  { value: "neq", label: "différent" },
  { value: "contains", label: "contient" },
  { value: "not_contains", label: "ne contient pas" },
  { value: "in", label: "dans" },
  { value: "not_in", label: "pas dans" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "after", label: "après" },
  { value: "before", label: "avant" },
  { value: "has_any", label: "a au moins un" },
  { value: "has_all", label: "a tous" },
  { value: "is_empty", label: "est vide" },
  { value: "is_not_empty", label: "n’est pas vide" },
];

function SmallSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function formatAuthors(authors: string[]) {
  if (!authors.length) return "—";
  return authors.join(", ");
}

function SortableBookRow({ book, disabled }: { book: ShelfDetailBookRow; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.id,
    disabled: Boolean(disabled),
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-background flex items-center justify-between gap-3 rounded-2xl border border-(--eleven-border-subtle) px-3 py-2",
        isDragging && "shadow-eleven-warm",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          <Link className="underline-offset-4 hover:underline" href={`/book/${book.id}`}>
            {book.title}
          </Link>
        </div>
        <div className="text-muted-foreground truncate text-xs">{formatAuthors(book.authors)}</div>
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
      </div>
    </div>
  );
}

function coerceRules(input: unknown): ShelfRuleDraft {
  if (input && typeof input === "object") {
    const x = input as { match?: unknown; conditions?: unknown };
    const match = x.match === "any" ? "any" : "all";
    const conditions: RuleCondition[] = Array.isArray(x.conditions)
      ? x.conditions
          .filter((c) => c && typeof c === "object")
          .slice(0, 50)
          .map((c) => {
            const cc = c as { field?: unknown; operator?: unknown; value?: unknown };
            const field = (typeof cc.field === "string" ? cc.field : "language") as RuleField;
            const operator = (typeof cc.operator === "string" ? cc.operator : "eq") as RuleOp;
            return { field, operator, value: cc.value };
          })
      : [];
    return { match, conditions };
  }
  return { match: "all", conditions: [] };
}

function defaultValueFor(field: RuleField, op: RuleOp): unknown {
  if (op === "is_empty" || op === "is_not_empty") return undefined;
  if (field === "page_count") return 300;
  if (field === "added_at") return new Date().toISOString().slice(0, 10);
  if (field === "tags") {
    if (op === "in" || op === "not_in" || op === "has_any" || op === "has_all") return ["to-read"];
    return "to-read";
  }
  if (op === "in" || op === "not_in" || op === "has_any" || op === "has_all") return ["fr"];
  return "fr";
}

export function ShelfDetailClient({
  shelf,
  initialBooks,
}: {
  shelf: ShelfDetailShelf;
  initialBooks: ShelfDetailBookRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();

  const [books, setBooks] = React.useState<ShelfDetailBookRow[]>(initialBooks);
  const [sortMode, setSortMode] = React.useState<"custom" | "az" | "added">("custom");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const canReorderBooks = shelf.type === "manual";
  const canEditMeta = shelf.type === "manual" || shelf.type === "dynamic";
  const canEditRules = shelf.type === "dynamic";

  const [metaDraft, setMetaDraft] = React.useState({
    name: shelf.name,
    icon: shelf.icon ?? "",
    description: shelf.description ?? "",
  });

  const [ruleDraft, setRuleDraft] = React.useState<ShelfRuleDraft>(() => coerceRules(shelf.rules));
  const [preview, setPreview] = React.useState<{
    count: number;
    examples: Array<{ id: string; title: string }>;
  } | null>(null);

  function applySort(mode: "az" | "added") {
    const sorted = [...books].sort((a, b) => {
      if (mode === "az") return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
    setBooks(sorted);
    setSortMode(mode);
  }

  function onDragEnd(ev: DragEndEvent) {
    if (!canReorderBooks) return;
    const activeId = String(ev.active.id);
    const overId = ev.over ? String(ev.over.id) : null;
    if (!overId || activeId === overId) return;

    const oldIndex = books.findIndex((x) => x.id === activeId);
    const newIndex = books.findIndex((x) => x.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(books, oldIndex, newIndex);
    setBooks(next);
    setSortMode("custom");

    startTransition(async () => {
      await reorderShelfBooksAction({ shelfId: shelf.id, bookIds: next.map((b) => b.id) });
      router.refresh();
    });
  }

  function saveMeta() {
    if (!canEditMeta) return;
    startTransition(async () => {
      const res = await updateShelfAction({
        shelfId: shelf.id,
        name: metaDraft.name.trim(),
        icon: metaDraft.icon.trim() ? metaDraft.icon.trim().slice(0, 50) : null,
        description: metaDraft.description.trim() ? metaDraft.description.trim() : null,
      });
      if (res.ok) router.refresh();
    });
  }

  async function refreshPreview(draft: ShelfRuleDraft) {
    const res = await previewShelfRuleAction({ rules: draft, limit: 10 });
    if (res.ok) {
      setPreview({
        count: res.count,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        examples: (res.examples as any[]).map((e) => ({
          id: String(e.id),
          title: String(e.title),
        })),
      });
    }
  }

  function saveRules() {
    if (!canEditRules) return;
    startTransition(async () => {
      const res = await updateShelfRuleAction({ shelfId: shelf.id, rules: ruleDraft });
      if (res.ok) {
        await refreshPreview(ruleDraft);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="mr-2">{shelf.icon ?? (shelf.type === "dynamic" ? "🧩" : "📚")}</span>
            {shelf.name}
          </h1>
          <p className="text-muted-foreground text-sm">{shelf.description ?? "—"}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/shelves">Retour</Link>
          </Button>
        </div>
      </div>

      {canEditMeta && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Détails</CardTitle>
            <CardDescription>Nom, icône et description.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 py-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <div className="text-muted-foreground text-xs">Nom</div>
                <Input
                  value={metaDraft.name}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground text-xs">Emoji</div>
                <Input
                  value={metaDraft.icon}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, icon: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Description</div>
              <Textarea
                value={metaDraft.description}
                onChange={(e) => setMetaDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveMeta} disabled={busy || !metaDraft.name.trim()}>
                <SaveIcon />
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {canEditRules && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Règles</CardTitle>
            <CardDescription>Construit une requête dynamique (JSONB en base).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-muted-foreground text-xs">Match</div>
              <SmallSelect
                value={ruleDraft.match}
                onChange={(v) =>
                  setRuleDraft((d) => ({ ...d, match: v === "any" ? "any" : "all" }))
                }
                options={[
                  { value: "all", label: "all (AND)" },
                  { value: "any", label: "any (OR)" },
                ]}
                disabled={busy}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setRuleDraft((d) => ({
                    ...d,
                    conditions: [
                      ...d.conditions,
                      {
                        field: "language",
                        operator: "eq",
                        value: defaultValueFor("language", "eq"),
                      },
                    ],
                  }))
                }
                disabled={busy || ruleDraft.conditions.length >= 50}
              >
                + Condition
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => refreshPreview(ruleDraft)}
                disabled={busy}
              >
                <SparklesIcon />
                Prévisualiser
              </Button>
            </div>

            <div className="space-y-2">
              {ruleDraft.conditions.map((c, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-2xl border border-(--eleven-border-subtle) p-3 sm:grid-cols-[180px_180px_1fr_auto]"
                >
                  <SmallSelect
                    value={c.field}
                    onChange={(v) => {
                      const field = v as RuleField;
                      setRuleDraft((d) => {
                        const next = [...d.conditions];
                        const op = next[idx]?.operator ?? "eq";
                        next[idx] = { field, operator: op, value: defaultValueFor(field, op) };
                        return { ...d, conditions: next };
                      });
                    }}
                    options={fieldOptions}
                    disabled={busy}
                  />
                  <SmallSelect
                    value={c.operator}
                    onChange={(v) => {
                      const op = v as RuleOp;
                      setRuleDraft((d) => {
                        const next = [...d.conditions];
                        const field = next[idx]?.field ?? "language";
                        next[idx] = { field, operator: op, value: defaultValueFor(field, op) };
                        return { ...d, conditions: next };
                      });
                    }}
                    options={operatorOptions}
                    disabled={busy}
                  />
                  <div className="sm:pt-0">
                    {c.operator === "is_empty" || c.operator === "is_not_empty" ? (
                      <div className="text-muted-foreground flex h-9 items-center text-sm">—</div>
                    ) : (
                      <Input
                        value={
                          Array.isArray(c.value)
                            ? (c.value as unknown[]).join(", ")
                            : typeof c.value === "string" || typeof c.value === "number"
                              ? String(c.value)
                              : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          setRuleDraft((d) => {
                            const next = [...d.conditions];
                            const current = next[idx]!;
                            const wantsArray =
                              current.operator === "in" ||
                              current.operator === "not_in" ||
                              current.operator === "has_any" ||
                              current.operator === "has_all";
                            const value: unknown = wantsArray
                              ? raw
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean)
                              : raw;
                            next[idx] = { ...current, value };
                            return { ...d, conditions: next };
                          });
                        }}
                        placeholder={
                          c.operator === "in" ||
                          c.operator === "has_any" ||
                          c.operator === "has_all"
                            ? c.field === "tags"
                              ? "ex: to-read, classic"
                              : "ex: fr, en"
                            : "valeur"
                        }
                        disabled={busy}
                      />
                    )}
                  </div>
                  <div className="flex justify-end sm:justify-start">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRuleDraft((d) => ({
                          ...d,
                          conditions: d.conditions.filter((_, i) => i !== idx),
                        }))
                      }
                      disabled={busy}
                    >
                      Retirer
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-muted-foreground text-sm">
                {preview ? (
                  <>
                    <span className="text-foreground font-medium">{preview.count}</span> résultats •{" "}
                    {preview.examples.length} exemples
                  </>
                ) : (
                  "Prévisualise pour voir le résultat."
                )}
              </div>
              <Button onClick={saveRules} disabled={busy}>
                <SaveIcon />
                Enregistrer règles
              </Button>
            </div>

            {preview?.examples?.length ? (
              <div className="rounded-2xl border border-(--eleven-border-subtle) p-3">
                <div className="text-muted-foreground mb-2 text-xs">Exemples</div>
                <ul className="space-y-1 text-sm">
                  {preview.examples.map((e) => (
                    <li key={e.id} className="truncate">
                      <Link className="underline-offset-4 hover:underline" href={`/book/${e.id}`}>
                        {e.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 border-b">
          <div className="space-y-1">
            <CardTitle>Livres</CardTitle>
            <CardDescription>
              {books.length} livre{books.length > 1 ? "s" : ""}
              {shelf.type === "reading" ? " (status reading)" : ""}
            </CardDescription>
          </div>

          {canReorderBooks && (
            <div className="flex items-center gap-1.5">
              <Button
                variant={sortMode === "custom" ? "blackPill" : "outline"}
                size="sm"
                onClick={() => setSortMode("custom")}
                disabled={busy}
              >
                Perso
              </Button>
              <Button variant="outline" size="sm" onClick={() => applySort("az")} disabled={busy}>
                A-Z
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => applySort("added")}
                disabled={busy}
              >
                Ajout
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-2 py-4">
          {canReorderBooks ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={books.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                {books.map((b) => (
                  <SortableBookRow key={b.id} book={b} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-2">
              {books.map((b) => (
                <SortableBookRow key={b.id} book={b} disabled />
              ))}
            </div>
          )}

          {!books.length && <div className="text-muted-foreground text-sm">Aucun livre.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
