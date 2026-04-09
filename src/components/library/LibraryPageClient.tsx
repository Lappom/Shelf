"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { LayoutGridIcon, ListIcon, SlidersHorizontalIcon, PlusIcon } from "lucide-react";

import { updateSearchPreferencesAction } from "@/app/(app)/search/actions";
import { patchUserPreferencesAction } from "@/app/(app)/actions/userPreferences";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type LibraryTagOption = { id: string; name: string; color: string };
export type LibraryShelfOption = {
  id: string;
  name: string;
  type: "manual" | "dynamic" | "favorites" | "reading";
};
export type LibraryPrefs = {
  booksPerPage: number;
  libraryInfiniteScroll: boolean;
  libraryView: "grid" | "list";
};

type ApiBookRow = {
  id: string;
  title: string;
  authors: unknown;
  description: string | null;
  coverUrl: string | null;
  format: string;
  language: string | null;
  pageCount: number | null;
  createdAt: string;
  publishDate: string | null;
  progress: number | null;
};
type ApiSearchResponse = { results: ApiBookRow[]; nextCursor: string | null };

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function authorsToString(authors: unknown) {
  if (!Array.isArray(authors)) return "";
  return authors
    .filter((x): x is string => typeof x === "string")
    .map(normalizeWhitespace)
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
}

function toCsv(list: string[]) {
  return list.join(",");
}

function formatPercent(p: number | null) {
  if (p == null || !Number.isFinite(p)) return null;
  const x = Math.round(Math.max(0, Math.min(1, p)) * 1000) / 10;
  return `${x.toFixed(1)}%`;
}

export function LibraryPageClient({
  initialTags,
  initialShelves,
  initialPrefs,
  isAdmin,
  adminFab,
}: {
  initialTags: LibraryTagOption[];
  initialShelves: LibraryShelfOption[];
  initialPrefs: LibraryPrefs;
  isAdmin: boolean;
  adminFab?: React.ReactNode;
}) {
  const [busyPrefs, startPrefsTransition] = useTransition();

  const [view, setView] = useState<"grid" | "list">(initialPrefs.libraryView ?? "grid");
  const [q, setQ] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [shelfId, setShelfId] = useState<string>("");
  const [statuses, setStatuses] = useState<string[]>([]);

  const [booksPerPage, setBooksPerPage] = useState<number>(initialPrefs.booksPerPage);
  const [infiniteScroll, setInfiniteScroll] = useState<boolean>(initialPrefs.libraryInfiniteScroll);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ApiBookRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastQueryKeyRef = useRef<string>("");

  const queryKey = useMemo(() => {
    return JSON.stringify({
      q: q.trim() || null,
      formats,
      languages,
      tagIds,
      shelfId: shelfId || null,
      statuses,
      limit: booksPerPage,
    });
  }, [q, formats, languages, tagIds, shelfId, statuses, booksPerPage]);

  async function fetchPage(args: { cursor?: string | null; append: boolean }) {
    setError(null);
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("mode", "websearch");
    params.set("sort", q.trim() ? "relevance" : "added_at");
    params.set("dir", "desc");
    params.set("limit", String(booksPerPage));
    if (args.cursor) params.set("cursor", args.cursor);

    if (formats.length) params.set("formats", toCsv(formats));
    if (languages.length) params.set("languages", toCsv(languages));
    if (tagIds.length) params.set("tagIds", toCsv(tagIds));
    if (shelfId) params.set("shelfId", shelfId);
    if (statuses.length) params.set("statuses", toCsv(statuses));

    try {
      const res = await fetch(`/api/search?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        signal: ac.signal,
      });
      if (!res.ok) throw new Error("FETCH_FAILED");
      const json = (await res.json()) as ApiSearchResponse;
      setItems((prev) => (args.append ? [...prev, ...json.results] : json.results));
      setNextCursor(json.nextCursor);
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") setError("Impossible de charger la bibliothèque.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (lastQueryKeyRef.current === queryKey) return;
      lastQueryKeyRef.current = queryKey;
      void fetchPage({ append: false });
    }, 250);
    return () => window.clearTimeout(t);
  }, [queryKey]);

  useEffect(() => {
    if (!infiniteScroll) return;
    const el = sentinelRef.current;
    if (!el) return;
    if (!nextCursor) return;
    if (loading) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (!nextCursor) return;
        void fetchPage({ cursor: nextCursor, append: true });
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [infiniteScroll, nextCursor, loading]);

  const applyView = (v: "grid" | "list") => {
    setView(v);
    startPrefsTransition(async () => {
      await patchUserPreferencesAction({ libraryView: v });
    });
  };

  const updatePrefs = (patch: { booksPerPage?: number; libraryInfiniteScroll?: boolean }) => {
    startPrefsTransition(async () => {
      const res = await updateSearchPreferencesAction(patch);
      if (!res.ok) return;
      if (patch.booksPerPage != null) setBooksPerPage(patch.booksPerPage);
      if (patch.libraryInfiniteScroll != null) setInfiniteScroll(patch.libraryInfiniteScroll);
    });
  };

  const Filters = (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-xs text-eleven-muted">Format</div>
        <div className="grid grid-cols-2 gap-2">
          {["epub", "physical", "pdf", "cbz", "cbr", "audiobook"].map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formats.includes(f)}
                onChange={(e) =>
                  setFormats((prev) => (e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)))
                }
              />
              <span className="capitalize">{f}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-eleven-muted">Langue</div>
        <Input
          placeholder="ex: fr,en (CSV)"
          value={languages.join(",")}
          onChange={(e) =>
            setLanguages(
              e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 10),
            )
          }
        />
      </div>

      <div className="space-y-2">
        <div className="text-xs text-eleven-muted">Étagère</div>
        <select
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
          value={shelfId}
          onChange={(e) => setShelfId(e.target.value)}
        >
          <option value="">Toutes</option>
          {initialShelves.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-eleven-muted">Tags</div>
        <div className="flex flex-wrap gap-2">
          {initialTags.slice(0, 50).map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTagIds((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))}
                className={cn(
                  "rounded-eleven-pill border px-3 py-1 text-xs transition",
                  on ? "bg-secondary shadow-eleven-card" : "text-eleven-muted hover:text-foreground",
                )}
                style={{ borderColor: t.color }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-eleven-muted">Statut de lecture</div>
        <div className="grid grid-cols-2 gap-2">
          {["not_started", "reading", "finished", "abandoned"].map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={statuses.includes(s)}
                onChange={(e) =>
                  setStatuses((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))
                }
              />
              <span>{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-eleven-muted">Pagination</div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-xl border bg-background px-3 py-2 text-sm"
            value={String(booksPerPage)}
            onChange={(e) => updatePrefs({ booksPerPage: Number(e.target.value) })}
          >
            <option value="12">12</option>
            <option value="24">24</option>
            <option value="48">48</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={infiniteScroll}
              onChange={(e) => updatePrefs({ libraryInfiniteScroll: e.target.checked })}
            />
            Scroll infini
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="eleven-display-section text-3xl">Bibliothèque</h1>
          <p className="text-sm text-eleven-secondary">
            Vue grille/liste, recherche, filtres et progression de lecture.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-eleven-pill border shadow-eleven-card">
            <Button
              type="button"
              variant={view === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-eleven-pill"
              onClick={() => applyView("grid")}
              disabled={busyPrefs}
            >
              <LayoutGridIcon className="h-4 w-4" />
              <span className="sr-only">Grille</span>
            </Button>
            <Button
              type="button"
              variant={view === "list" ? "secondary" : "ghost"}
              size="sm"
              className="rounded-eleven-pill"
              onClick={() => applyView("list")}
              disabled={busyPrefs}
            >
              <ListIcon className="h-4 w-4" />
              <span className="sr-only">Liste</span>
            </Button>
          </div>

          <Button
            type="button"
            variant="outline"
            className="rounded-eleven-pill sm:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontalIcon className="h-4 w-4" />
            Filtres
          </Button>

          {isAdmin ? (
            <div className="hidden sm:block">{adminFab ?? null}</div>
          ) : null}

          {isAdmin ? (
            <Button
              type="button"
              className="rounded-eleven-pill shadow-eleven-button-white sm:hidden"
              onClick={() => setFiltersOpen(true)}
            >
              <PlusIcon className="h-4 w-4" />
              Ajouter
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <aside className="hidden w-full max-w-xs shrink-0 sm:block">
          <Card className="p-4 shadow-eleven-card">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Filtres</div>
              <button
                type="button"
                className="text-xs text-eleven-muted hover:text-foreground"
                onClick={() => {
                  setFormats([]);
                  setLanguages([]);
                  setTagIds([]);
                  setShelfId("");
                  setStatuses([]);
                }}
              >
                Réinitialiser
              </button>
            </div>
            {Filters}
          </Card>
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Rechercher un livre…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="eleven-body-airy"
            />
            <Button asChild variant="outline" className="rounded-eleven-pill">
              <Link href="/search">Avancé</Link>
            </Button>
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          {view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((b) => (
                <Link key={b.id} href={`/book/${b.id}`} className="group">
                  <Card className="overflow-hidden shadow-eleven-card transition hover:shadow-eleven-button-white">
                    <div className="relative aspect-2/3 w-full bg-muted">
                      {b.coverUrl ? (
                        <Image
                          src={`/api/books/${b.id}/cover`}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 20vw, 12vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-eleven-muted">
                          Couverture
                        </div>
                      )}
                      {(() => {
                        const pct = formatPercent(b.progress);
                        if (!pct) return null;
                        return (
                          <div className="absolute bottom-2 left-2 rounded-eleven-pill bg-background/85 px-2 py-1 text-[11px] shadow-eleven-card">
                            {pct}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-1 p-3">
                      <div className="line-clamp-2 text-sm font-medium">{b.title}</div>
                      <div className="line-clamp-1 text-xs text-eleven-muted">{authorsToString(b.authors) || "—"}</div>
                      <div className="text-[11px] text-eleven-muted">
                        {b.format.toUpperCase()}
                        {b.language ? ` · ${b.language}` : ""}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="overflow-hidden shadow-eleven-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-eleven-muted">
                    <tr>
                      <th className="px-4 py-3">Titre</th>
                      <th className="px-4 py-3">Auteur</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Progression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((b) => (
                      <tr key={b.id} className="border-t">
                        <td className="px-4 py-3">
                          <Link className="hover:underline" href={`/book/${b.id}`}>
                            {b.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-eleven-muted">{authorsToString(b.authors) || "—"}</td>
                        <td className="px-4 py-3 text-eleven-muted">{b.format}</td>
                        <td className="px-4 py-3 text-eleven-muted">{formatPercent(b.progress) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!infiniteScroll && nextCursor ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                className="rounded-eleven-pill"
                disabled={loading}
                onClick={() => fetchPage({ cursor: nextCursor, append: true })}
              >
                {loading ? "Chargement…" : "Charger plus"}
              </Button>
            </div>
          ) : null}

          <div ref={sentinelRef} />
        </div>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Filtres</DialogTitle>
          </DialogHeader>
          {Filters}
          {isAdmin ? <div className="pt-4">{adminFab ?? null}</div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

