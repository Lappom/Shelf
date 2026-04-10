"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { SlidersHorizontalIcon, PlusIcon } from "lucide-react";

import { updateSearchPreferencesAction } from "@/app/(app)/search/actions";
import { patchUserPreferencesAction } from "@/app/(app)/actions/userPreferences";
import {
  RecommendationsCarousel,
  type CarouselRecoItem,
} from "@/components/recommendations/RecommendationsCarousel";
import { LibraryViewToggle } from "@/components/library/LibraryViewToggle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type LibraryTagOption = { id: string; name: string; color: string };
export type LibraryShelfOption = {
  id: string;
  name: string;
  type: "manual" | "dynamic" | "favorites" | "reading" | "read";
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
  /** HMAC token for Next/Image optimizer (optional if server has no signing secret). */
  coverToken: string | null;
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

function coverImageSrc(bookId: string, coverUrl: string | null, coverToken: string | null) {
  if (!coverUrl) return null;
  if (coverToken) return `/api/books/${bookId}/cover?t=${encodeURIComponent(coverToken)}`;
  return `/api/books/${bookId}/cover`;
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
  initialRecommendations,
  initialTags,
  initialShelves,
  initialPrefs,
  isAdmin,
  adminFab,
}: {
  initialRecommendations: CarouselRecoItem[];
  initialTags: LibraryTagOption[];
  initialShelves: LibraryShelfOption[];
  initialPrefs: LibraryPrefs;
  isAdmin: boolean;
  adminFab?: React.ReactNode;
}) {
  const [busyPrefs, startPrefsTransition] = useTransition();

  const [view, setView] = useState<"grid" | "list">(initialPrefs.libraryView ?? "grid");
  const [q, setQ] = useState("");
  const [author, setAuthor] = useState("");
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
  const skipNextLibraryUrlSync = useRef(true);

  const queryKey = useMemo(() => {
    return JSON.stringify({
      q: q.trim() || null,
      author: author.trim() || null,
      formats,
      languages,
      tagIds,
      shelfId: shelfId || null,
      statuses,
      limit: booksPerPage,
    });
  }, [q, author, formats, languages, tagIds, shelfId, statuses, booksPerPage]);

  // Hydrate q/author from URL (deep links from book detail, shared library URLs).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const uq = sp.get("q");
    const ua = sp.get("author");
    if (uq) setQ(uq);
    if (ua) setAuthor(ua);
  }, []);

  // Keep URL in sync with library search state (shareable).
  useEffect(() => {
    if (skipNextLibraryUrlSync.current) {
      skipNextLibraryUrlSync.current = false;
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    if (author.trim()) params.set("author", author.trim());
    else params.delete("author");
    const qs = params.toString();
    const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", path);
  }, [q, author]);

  const fetchPage = useCallback(
    async (args: { cursor?: string | null; append: boolean }) => {
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
      if (author.trim()) params.set("author", author.trim());

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
        if ((e as { name?: string }).name !== "AbortError")
          setError("Impossible de charger la bibliothèque.");
      } finally {
        setLoading(false);
      }
    },
    [q, author, booksPerPage, formats, languages, tagIds, shelfId, statuses],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (lastQueryKeyRef.current === queryKey) return;
      lastQueryKeyRef.current = queryKey;
      void fetchPage({ append: false });
    }, 250);
    return () => window.clearTimeout(t);
  }, [queryKey, fetchPage]);

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
  }, [infiniteScroll, nextCursor, loading, fetchPage]);

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
        <div className="text-eleven-muted text-xs">Auteur (contient)</div>
        <Input
          placeholder="Filtrer par auteur…"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="text-sm"
          aria-label="Filtrer par auteur"
        />
      </div>

      <div className="space-y-2">
        <div className="text-eleven-muted text-xs">Format</div>
        <div className="grid grid-cols-2 gap-2">
          {["epub", "physical", "pdf", "cbz", "cbr", "audiobook"].map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formats.includes(f)}
                onChange={(e) =>
                  setFormats((prev) =>
                    e.target.checked ? [...prev, f] : prev.filter((x) => x !== f),
                  )
                }
              />
              <span className="capitalize">{f}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-eleven-muted text-xs">Langue</div>
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
        <div className="text-eleven-muted text-xs">Étagère</div>
        <select
          className="bg-background w-full rounded-xl border px-3 py-2 text-sm"
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
        <div className="text-eleven-muted text-xs">Tags</div>
        <div className="flex flex-wrap gap-2">
          {initialTags.slice(0, 50).map((t) => {
            const on = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setTagIds((prev) => (on ? prev.filter((x) => x !== t.id) : [...prev, t.id]))
                }
                className={cn(
                  "rounded-eleven-pill border px-3 py-1 text-xs transition",
                  on
                    ? "bg-secondary shadow-eleven-card"
                    : "text-eleven-muted hover:text-foreground",
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
        <div className="text-eleven-muted text-xs">Statut de lecture</div>
        <div className="grid grid-cols-2 gap-2">
          {["not_started", "reading", "finished", "abandoned"].map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={statuses.includes(s)}
                onChange={(e) =>
                  setStatuses((prev) =>
                    e.target.checked ? [...prev, s] : prev.filter((x) => x !== s),
                  )
                }
              />
              <span>{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-eleven-muted text-xs">Pagination</div>
        <div className="flex items-center gap-2">
          <select
            className="bg-background rounded-xl border px-3 py-2 text-sm"
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
      <RecommendationsCarousel
        initialItems={initialRecommendations}
        className="library-results-enter"
      />

      <div className="library-hero-band flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="max-w-xl space-y-2">
          <h1 className="library-hero-display library-hero-enter text-3xl sm:text-[2.15rem]">
            Bibliothèque
          </h1>
          <p className="text-eleven-secondary library-hero-sub-enter text-sm leading-relaxed">
            Vue grille/liste, recherche, filtres et progression de lecture.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LibraryViewToggle view={view} onViewChange={applyView} disabled={busyPrefs} />

          <Button
            type="button"
            variant="outline"
            className="rounded-eleven-pill sm:hidden"
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontalIcon className="h-4 w-4" />
            Filtres
          </Button>

          {isAdmin ? <div className="hidden sm:block">{adminFab ?? null}</div> : null}

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
          <Card className="shadow-eleven-card focus-within:ring-ring/45 p-4 transition-[box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:ring-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">Filtres</div>
              <button
                type="button"
                className="text-eleven-muted hover:text-foreground text-xs"
                onClick={() => {
                  setFormats([]);
                  setLanguages([]);
                  setTagIds([]);
                  setShelfId("");
                  setStatuses([]);
                  setAuthor("");
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
              className="eleven-body-airy transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <Button asChild variant="outline" className="rounded-eleven-pill">
              <Link href="/search">Catalogue</Link>
            </Button>
          </div>

          {error ? (
            <div className="border-destructive/30 bg-destructive/10 rounded-2xl border px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          {view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {items.map((b, index) => (
                <Link
                  key={b.id}
                  href={`/book/${b.id}`}
                  className="group library-card-enter"
                  style={
                    {
                      "--library-enter-delay": `${Math.min(index, 23) * 45}ms`,
                    } as React.CSSProperties
                  }
                >
                  <Card className="shadow-eleven-card overflow-hidden transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1 group-hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:shadow-eleven-card">
                    <div className="bg-muted relative aspect-2/3 w-full overflow-hidden">
                      {b.coverUrl ? (
                        <Image
                          src={
                            coverImageSrc(b.id, b.coverUrl, b.coverToken) ??
                            `/api/books/${b.id}/cover`
                          }
                          alt=""
                          fill
                          unoptimized={!b.coverToken}
                          sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 16vw"
                          className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                      ) : (
                        <div className="text-eleven-muted flex h-full w-full items-center justify-center text-xs">
                          Couverture
                        </div>
                      )}
                      {(() => {
                        const pct = formatPercent(b.progress);
                        if (!pct) return null;
                        return (
                          <div className="rounded-eleven-pill bg-background/85 shadow-eleven-card absolute bottom-2 left-2 px-2 py-1 text-[11px]">
                            {pct}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-1 p-3">
                      <div className="line-clamp-2 text-sm font-medium">{b.title}</div>
                      <div className="text-eleven-muted line-clamp-1 text-xs">
                        {authorsToString(b.authors) || "—"}
                      </div>
                      <div className="text-eleven-muted text-[11px]">
                        {b.format.toUpperCase()}
                        {b.language ? ` · ${b.language}` : ""}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="shadow-eleven-card library-results-enter overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-eleven-muted text-left text-xs">
                    <tr>
                      <th className="px-4 py-3">Titre</th>
                      <th className="px-4 py-3">Auteur</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Progression</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((b, index) => (
                      <tr
                        key={b.id}
                        className="library-row-enter border-t transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/30"
                        style={
                          {
                            "--library-enter-delay": `${Math.min(index, 23) * 35}ms`,
                          } as React.CSSProperties
                        }
                      >
                        <td className="px-4 py-3">
                          <Link className="hover:underline" href={`/book/${b.id}`}>
                            {b.title}
                          </Link>
                        </td>
                        <td className="text-eleven-muted px-4 py-3">
                          {authorsToString(b.authors) || "—"}
                        </td>
                        <td className="text-eleven-muted px-4 py-3">{b.format}</td>
                        <td className="text-eleven-muted px-4 py-3">
                          {formatPercent(b.progress) ?? "—"}
                        </td>
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
