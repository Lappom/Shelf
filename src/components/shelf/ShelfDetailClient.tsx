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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, GripVerticalIcon, SaveIcon, SearchIcon } from "lucide-react";

import { ShelfRuleMatchControls } from "@/components/shelf/ShelfRuleMatchControls";
import { ShelfRuleSelect } from "@/components/shelf/ShelfRuleSelect";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  loadMoreShelfBooksAction,
  previewShelfRuleAction,
  reorderShelfBooksAction,
  updateShelfAction,
  updateShelfRuleAction,
} from "@/app/(app)/shelves/actions";
import type { ShelfDetailBookRow } from "@/lib/shelves/shelfBooksPage";

export type { ShelfDetailBookRow };

export type ShelfDetailShelf = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: "manual" | "dynamic" | "favorites" | "reading" | "read";
  createdAt: string;
  rules: unknown | null;
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

function shelfDetailTypeLabel(t: ShelfDetailShelf["type"]) {
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

function formatAuthors(authors: string[]) {
  if (!authors.length) return "—";
  return authors.join(", ");
}

const FORMAT_BADGE: Record<ShelfDetailBookRow["format"], string> = {
  epub: "EPUB",
  pdf: "PDF",
  physical: "Papier",
  cbz: "CBZ",
  cbr: "CBR",
  audiobook: "Audio",
};

function bookCoverSrc(book: ShelfDetailBookRow) {
  if (!book.coverUrl) return null;
  if (book.coverToken)
    return `/api/books/${book.id}/cover?t=${encodeURIComponent(book.coverToken)}`;
  return `/api/books/${book.id}/cover`;
}

function SettingsDetails({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group shadow-eleven-card rounded-2xl border border-(--eleven-border-subtle) bg-card open:shadow-eleven-button-white">
      <summary className="eleven-body-airy flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="font-heading text-base font-light tracking-tight">{title}</span>
          <span className="text-eleven-muted text-xs font-normal">{hint}</span>
        </span>
        <ChevronDownIcon className="text-eleven-muted size-4 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="shelf-details-body border-t border-(--eleven-border-subtle) px-4 py-4">
        {children}
      </div>
    </details>
  );
}

function ShelfBookCard({
  book,
  dragHandle,
  className,
}: {
  book: ShelfDetailBookRow;
  dragHandle?: React.ReactNode;
  className?: string;
}) {
  const src = bookCoverSrc(book);
  return (
    <div
      className={cn(
        "bg-background/80 flex min-h-[4.5rem] items-stretch gap-1 rounded-2xl border border-(--eleven-border-subtle) transition-colors duration-200 ease-out hover:bg-muted/25",
        className,
      )}
    >
      <Link
        href={`/book/${book.id}`}
        className="group/shelf-book focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-3 py-2 pl-2.5 pr-1 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:gap-3.5 sm:py-2.5 sm:pl-3.5"
      >
        <div className="shadow-eleven-button-white relative h-[4.25rem] w-[2.85rem] shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-black/8 transition-transform duration-300 ease-out will-change-transform group-hover/shelf-book:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover/shelf-book:scale-100 dark:ring-white/10 sm:h-[4.5rem] sm:w-[3.05rem]">
          {src ? (
            <Image
              src={src}
              alt=""
              fill
              className="object-cover"
              sizes="52px"
              unoptimized={!book.coverToken}
            />
          ) : (
            <div className="from-muted to-muted/60 flex h-full w-full items-end justify-center bg-gradient-to-b pb-1">
              <span className="text-eleven-muted text-[10px] font-medium">—</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-0.5">
          <span className="text-foreground eleven-body-airy line-clamp-2 text-sm leading-snug font-medium sm:text-[0.95rem]">
            {book.title}
          </span>
          <span className="text-eleven-muted line-clamp-2 text-xs leading-relaxed sm:line-clamp-1">
            <span className="text-foreground/80 mr-1.5 font-semibold sm:hidden">
              {FORMAT_BADGE[book.format]}
            </span>
            {formatAuthors(book.authors)}
          </span>
        </div>
      </Link>
      <div className="flex shrink-0 items-center gap-1 py-2 pr-2 pl-0 sm:pr-2.5">
        <span
          className="text-eleven-muted bg-secondary/90 eleven-body-airy hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase sm:inline"
          title={book.format}
        >
          {FORMAT_BADGE[book.format]}
        </span>
        {dragHandle}
      </div>
    </div>
  );
}

function SortableBookRow({
  book,
  disabled,
  entranceIndex = 0,
}: {
  book: ShelfDetailBookRow;
  disabled?: boolean;
  entranceIndex?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: book.id,
    disabled: Boolean(disabled),
  });

  const delayMs = Math.min(entranceIndex, 24) * 36;
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "relative z-20")}>
      <div
        className="shelf-item-enter"
        style={{ "--shelf-enter-delay": `${delayMs}ms` } as React.CSSProperties}
      >
        <ShelfBookCard
          book={book}
          className={cn(isDragging && "shadow-eleven-warm ring-2 ring-ring/40")}
          dragHandle={
            !disabled ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-9 shrink-0 cursor-grab touch-manipulation active:cursor-grabbing"
                aria-label="Réordonner"
                {...attributes}
                {...listeners}
              >
                <GripVerticalIcon className="size-4" />
              </Button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

function StaticShelfBookRow({
  book,
  entranceIndex = 0,
}: {
  book: ShelfDetailBookRow;
  entranceIndex?: number;
}) {
  const delayMs = Math.min(entranceIndex, 24) * 36;
  return (
    <div
      className="shelf-item-enter"
      style={{ "--shelf-enter-delay": `${delayMs}ms` } as React.CSSProperties}
    >
      <ShelfBookCard book={book} />
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
  initialNextCursor,
}: {
  shelf: ShelfDetailShelf;
  initialBooks: ShelfDetailBookRow[];
  initialNextCursor: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = React.useTransition();

  const [books, setBooks] = React.useState<ShelfDetailBookRow[]>(initialBooks);
  const [nextCursor, setNextCursor] = React.useState<string | null>(initialNextCursor);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [sortMode, setSortMode] = React.useState<"custom" | "az" | "added">("custom");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const canReorderBooks = shelf.type === "manual";
  const reorderBlockedByPagination = canReorderBooks && nextCursor !== null;
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

  const [bookSearch, setBookSearch] = React.useState("");

  const bookSearchTrim = bookSearch.trim().toLowerCase();
  const filteredBooks = React.useMemo(() => {
    if (!bookSearchTrim) return books;
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(bookSearchTrim) ||
        b.authors.some((a) => a.toLowerCase().includes(bookSearchTrim)),
    );
  }, [books, bookSearchTrim]);

  const reorderUiActive =
    canReorderBooks && !reorderBlockedByPagination && bookSearchTrim.length === 0;

  async function loadMoreBooks() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await loadMoreShelfBooksAction({ shelfId: shelf.id, cursor: nextCursor });
      if (!res.ok) return;
      setBooks((prev) => [...prev, ...res.books]);
      setNextCursor(res.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadAllBooksForReorder() {
    let cur = nextCursor;
    if (!cur) return;
    setLoadingMore(true);
    try {
      const acc: ShelfDetailBookRow[] = [];
      while (cur) {
        const res = await loadMoreShelfBooksAction({ shelfId: shelf.id, cursor: cur });
        if (!res.ok) break;
        acc.push(...res.books);
        cur = res.nextCursor;
      }
      setBooks((prev) => [...prev, ...acc]);
      setNextCursor(null);
    } finally {
      setLoadingMore(false);
    }
  }

  function applySort(mode: "az" | "added") {
    const sorted = [...books].sort((a, b) => {
      if (mode === "az") return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    });
    setBooks(sorted);
    setSortMode(mode);
  }

  function onDragEnd(ev: DragEndEvent) {
    if (!reorderUiActive) return;
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

  const booksToRender = bookSearchTrim ? filteredBooks : books;

  return (
    <div className="space-y-6">
      <header className="shelf-hero-enter flex flex-col gap-4 border-b border-(--eleven-border-subtle) pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
          <span
            className="text-foreground shrink-0 text-4xl leading-none sm:text-[2.75rem]"
            aria-hidden
          >
            {shelf.icon ?? (shelf.type === "dynamic" ? "🧩" : "📚")}
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 gap-y-1">
              <h1 className="eleven-display-section text-foreground text-3xl md:text-4xl">
                {shelf.name}
              </h1>
              <span className="bg-secondary text-foreground eleven-body-airy inline-flex items-center rounded-eleven-pill px-2.5 py-0.5 text-xs font-medium">
                {shelfDetailTypeLabel(shelf.type)}
              </span>
            </div>
            {shelf.description?.trim() ? (
              <p className="text-eleven-secondary eleven-body-airy text-sm">{shelf.description}</p>
            ) : (
              <p className="text-eleven-muted eleven-body-airy text-sm">Aucune description.</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="whitePill">
            <Link href="/shelves">Étagères</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-eleven-pill">
            <Link href="/library">Bibliothèque</Link>
          </Button>
        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="bg-muted/20 border-b border-(--eleven-border-subtle) px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg sm:text-xl">Livres</CardTitle>
              <CardDescription className="eleven-body-airy mt-1">
                <span className="text-foreground font-medium">{books.length}</span> titre
                {books.length > 1 ? "s" : ""}
                {bookSearchTrim ? (
                  <>
                    {" "}
                    · <span className="text-foreground font-medium">{filteredBooks.length}</span>{" "}
                    affiché{filteredBooks.length > 1 ? "s" : ""}
                  </>
                ) : null}
                {nextCursor ? " · liste partielle" : ""}
                {shelf.type === "reading"
                  ? " · en cours de lecture"
                  : shelf.type === "read"
                    ? " · statut « lu »"
                    : ""}
              </CardDescription>
            </div>
            <div className="relative max-w-full lg:w-[min(100%,20rem)]">
              <SearchIcon className="text-eleven-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={bookSearch}
                onChange={(e) => setBookSearch(e.target.value)}
                placeholder="Filtrer titre ou auteur…"
                className="eleven-body-airy h-10 bg-background pl-9"
                aria-label="Filtrer les livres"
              />
            </div>
          </div>
        </div>

        <div className="sticky top-14 z-10 flex flex-col gap-2 border-b border-(--eleven-border-subtle) bg-card/95 px-4 py-2.5 backdrop-blur-md sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
          {canReorderBooks ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Tri des livres"
            >
              <span className="text-eleven-muted mr-1 text-xs font-medium uppercase">Tri</span>
              <Button
                variant={sortMode === "custom" ? "blackPill" : "outline"}
                size="sm"
                type="button"
                onClick={() => setSortMode("custom")}
                disabled={busy}
              >
                Perso
              </Button>
              <Button
                variant={sortMode === "az" ? "blackPill" : "outline"}
                size="sm"
                type="button"
                onClick={() => applySort("az")}
                disabled={busy}
              >
                A-Z
              </Button>
              <Button
                variant={sortMode === "added" ? "blackPill" : "outline"}
                size="sm"
                type="button"
                onClick={() => applySort("added")}
                disabled={busy}
              >
                Ajout
              </Button>
            </div>
          ) : (
            <p className="text-eleven-muted eleven-body-airy text-xs">
              Ordre défini par l’étagère ({shelfDetailTypeLabel(shelf.type)}).
            </p>
          )}
        </div>

        <CardContent className="space-y-3 pt-4 sm:pt-5">
          {reorderBlockedByPagination ? (
            <div className="rounded-xl border border-(--eleven-border-subtle) bg-secondary/40 px-3 py-2.5 text-sm eleven-body-airy shadow-eleven-button-white dark:bg-secondary/25">
              Le réordonnancement nécessite la liste complète.{" "}
              <button
                type="button"
                className="text-foreground font-medium underline underline-offset-4"
                disabled={loadingMore}
                onClick={() => void loadAllBooksForReorder()}
              >
                Tout charger
              </button>
            </div>
          ) : null}

          {canReorderBooks && bookSearchTrim.length > 0 ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-sm eleven-body-airy dark:bg-amber-500/10">
              Le glisser-déposer est désactivé pendant la recherche. Efface le filtre pour réordonner.
            </div>
          ) : null}

          {!books.length ? (
            <div className="rounded-2xl border border-dashed border-(--eleven-border-subtle) bg-muted/15 px-4 py-12 text-center">
              <p className="text-eleven-secondary eleven-body-airy text-sm">
                Aucun livre dans cette étagère.
              </p>
              <Button asChild variant="outline" className="mt-4 rounded-eleven-pill">
                <Link href="/library">Parcourir la bibliothèque</Link>
              </Button>
            </div>
          ) : books.length > 0 && filteredBooks.length === 0 ? (
            <p className="text-eleven-muted eleven-body-airy py-10 text-center text-sm">
              Aucun résultat pour « {bookSearch.trim()} ».
            </p>
          ) : reorderUiActive ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={books.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2.5">
                  {books.map((b, i) => (
                    <SortableBookRow key={b.id} book={b} disabled={false} entranceIndex={i} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-2.5">
              {booksToRender.map((b, i) => (
                <StaticShelfBookRow key={b.id} book={b} entranceIndex={i} />
              ))}
            </div>
          )}

          {nextCursor ? (
            <div className="flex justify-center border-t border-(--eleven-border-subtle) pt-4 sm:justify-start">
              <Button
                type="button"
                variant="warmStone"
                size="sm"
                disabled={loadingMore}
                onClick={() => void loadMoreBooks()}
              >
                {loadingMore ? "Chargement…" : "Charger plus de livres"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canEditMeta ? (
        <SettingsDetails title="Détails de l’étagère" hint="Nom, icône, description">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1 sm:col-span-2">
                <div className="text-eleven-muted text-xs">Nom</div>
                <Input
                  value={metaDraft.name}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, name: e.target.value }))}
                  className="eleven-body-airy"
                />
              </div>
              <div className="space-y-1">
                <div className="text-eleven-muted text-xs">Emoji</div>
                <Input
                  value={metaDraft.icon}
                  onChange={(e) => setMetaDraft((d) => ({ ...d, icon: e.target.value }))}
                  className="eleven-body-airy"
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-eleven-muted text-xs">Description</div>
              <Textarea
                value={metaDraft.description}
                onChange={(e) => setMetaDraft((d) => ({ ...d, description: e.target.value }))}
                className="eleven-body-airy"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={saveMeta} disabled={busy || !metaDraft.name.trim()}>
                <SaveIcon />
                Enregistrer
              </Button>
            </div>
          </div>
        </SettingsDetails>
      ) : null}

      {canEditRules ? (
        <SettingsDetails title="Règles dynamiques" hint="Filtres appliqués à ta bibliothèque">
          <div className="space-y-4">
            <ShelfRuleMatchControls
              match={ruleDraft.match}
              onMatchChange={(m) => setRuleDraft((d) => ({ ...d, match: m }))}
              onAddCondition={() =>
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
              onPreview={() => refreshPreview(ruleDraft)}
              busy={busy}
              conditionCount={ruleDraft.conditions.length}
            />

            <div className="space-y-2">
              {ruleDraft.conditions.map((c, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-2xl border border-(--eleven-border-subtle) p-3 sm:grid-cols-[180px_180px_1fr_auto]"
                >
                  <ShelfRuleSelect
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
                  <ShelfRuleSelect
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
                      <div className="text-eleven-muted flex h-9 items-center text-sm">—</div>
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
                        className="eleven-body-airy"
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
              <div className="text-eleven-secondary eleven-body-airy text-sm">
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
              <div className="rounded-2xl border border-(--eleven-border-subtle) bg-muted/10 p-3">
                <div className="text-eleven-muted mb-2 text-xs">Exemples</div>
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
          </div>
        </SettingsDetails>
      ) : null}
    </div>
  );
}
