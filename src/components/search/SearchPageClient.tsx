"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { updateSearchPreferencesAction } from "@/app/(app)/search/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildSearchUrlFromState, parseSearchUrlState } from "@/lib/search/searchUrlState";

export type SearchTagOption = { id: string; name: string; color: string };
export type SearchShelfOption = {
  id: string;
  name: string;
  type: "manual" | "dynamic" | "favorites" | "reading";
};
export type SearchPrefs = { booksPerPage: number; libraryInfiniteScroll: boolean };

type ApiSearchResult = {
  id: string;
  title: string;
  authors: unknown;
  description: string | null;
  coverUrl: string | null;
  coverToken: string | null;
  format: string;
  language: string | null;
  pageCount: number | null;
  createdAt: string;
  publishDate: string | null;
  progress: number | null;
};

type ApiSearchResponse = { results: ApiSearchResult[]; nextCursor: string | null };

type CatalogApiCandidate = {
  provider: "openlibrary" | "googlebooks";
  providerId: string;
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
  language: string | null;
  relevanceScore: number;
  coverPreviewUrl: string | null;
};

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function authorsToString(authors: unknown) {
  if (Array.isArray(authors)) {
    const xs = authors
      .filter((x): x is string => typeof x === "string")
      .map(normalizeWhitespace)
      .filter(Boolean);
    return xs.join(", ");
  }
  return "";
}

function splitQueryTerms(q: string) {
  return q
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function highlight(text: string, terms: string[]) {
  if (!terms.length) return text;
  let parts: Array<string | { mark: string }> = [text];
  for (const term of terms) {
    const next: Array<string | { mark: string }> = [];
    for (const p of parts) {
      if (typeof p !== "string") {
        next.push(p);
        continue;
      }
      const lower = p.toLowerCase();
      const needle = term.toLowerCase();
      let i = 0;
      while (i < p.length) {
        const idx = lower.indexOf(needle, i);
        if (idx === -1) {
          next.push(p.slice(i));
          break;
        }
        if (idx > i) next.push(p.slice(i, idx));
        next.push({ mark: p.slice(idx, idx + term.length) });
        i = idx + term.length;
      }
    }
    parts = next;
  }
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <mark key={i} className="text-foreground rounded-sm bg-(--eleven-warm)/40 px-0.5">
        {p.mark}
      </mark>
    ),
  );
}

function toCsv(list: string[]) {
  return list.join(",");
}

export function SearchPageClient({
  initialTags,
  initialShelves,
  initialPrefs,
  isAdmin = false,
}: {
  initialTags: SearchTagOption[];
  initialShelves: SearchShelfOption[];
  initialPrefs: SearchPrefs;
  isAdmin?: boolean;
}) {
  const [busyPrefs, startPrefsTransition] = useTransition();

  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"websearch" | "plain">("websearch");
  const [sort, setSort] = useState<
    "relevance" | "title" | "added_at" | "publish_date" | "author" | "progress" | "page_count"
  >("relevance");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const [formats, setFormats] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [shelfId, setShelfId] = useState<string>("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");

  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const [pagesMin, setPagesMin] = useState("");
  const [pagesMax, setPagesMax] = useState("");

  const [booksPerPage, setBooksPerPage] = useState<number>(initialPrefs.booksPerPage);
  const [infiniteScroll, setInfiniteScroll] = useState<boolean>(initialPrefs.libraryInfiniteScroll);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ApiSearchResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [searchScope, setSearchScope] = useState<"library" | "catalog">("library");
  const [catalogQ, setCatalogQ] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogApiCandidate[]>([]);
  const [catalogAddFeedback, setCatalogAddFeedback] = useState<
    Record<string, "idle" | "loading" | "added" | "already_exists" | "potential_conflict" | "error">
  >({});

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQueryKeyRef = useRef<string>("");
  const initializedFromUrlRef = useRef(false);

  const tagsById = useMemo(() => new Map(initialTags.map((t) => [t.id, t])), [initialTags]);
  const terms = useMemo(() => splitQueryTerms(q), [q]);

  const queryKey = useMemo(() => {
    return JSON.stringify({
      q: q.trim(),
      mode,
      sort,
      dir,
      formats,
      languages,
      tagIds,
      shelfId: shelfId || null,
      statuses,
      author: author.trim() || null,
      publisher: publisher.trim() || null,
      addedFrom: addedFrom.trim() || null,
      addedTo: addedTo.trim() || null,
      pagesMin: pagesMin.trim() || null,
      pagesMax: pagesMax.trim() || null,
      limit: booksPerPage,
    });
  }, [
    q,
    mode,
    sort,
    dir,
    formats,
    languages,
    tagIds,
    shelfId,
    statuses,
    author,
    publisher,
    addedFrom,
    addedTo,
    pagesMin,
    pagesMax,
    booksPerPage,
  ]);

  useEffect(() => {
    if (searchScope !== "catalog") return;
    const term = catalogQ.trim();
    if (!term) {
      setCatalogItems([]);
      setCatalogError(null);
      setCatalogLoading(false);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCatalogLoading(true);
        setCatalogError(null);
        try {
          const params = new URLSearchParams();
          params.set("q", term);
          const res = await fetch(`/api/catalog/search?${params.toString()}`, {
            method: "GET",
            credentials: "include",
          });
          const json = (await res.json().catch(() => null)) as {
            candidates?: CatalogApiCandidate[];
            error?: string;
          } | null;
          if (cancelled) return;
          if (!res.ok) {
            setCatalogItems([]);
            setCatalogError(json?.error ?? "Erreur catalogue.");
            return;
          }
          setCatalogItems(Array.isArray(json?.candidates) ? json!.candidates! : []);
        } catch {
          if (!cancelled) {
            setCatalogItems([]);
            setCatalogError("Erreur réseau.");
          }
        } finally {
          if (!cancelled) setCatalogLoading(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [searchScope, catalogQ]);

  // Initialize state from URL query params (deep-linking).
  useEffect(() => {
    if (initializedFromUrlRef.current) return;
    initializedFromUrlRef.current = true;
    const s = parseSearchUrlState(window.location.search);
    if (s.q != null) setQ(s.q);
    if (s.mode) setMode(s.mode);
    if (s.sort) setSort(s.sort);
    if (s.dir) setDir(s.dir);
    if (s.formats) setFormats(s.formats);
    if (s.languages) setLanguages(s.languages);
    if (s.tagIds) setTagIds(s.tagIds);
    if (s.statuses) setStatuses(s.statuses);
    if (s.shelfId != null) setShelfId(s.shelfId);
    if (s.author != null) setAuthor(s.author);
    if (s.publisher != null) setPublisher(s.publisher);
    if (s.addedFrom != null) setAddedFrom(s.addedFrom);
    if (s.addedTo != null) setAddedTo(s.addedTo);
    if (s.pagesMin != null) setPagesMin(s.pagesMin);
    if (s.pagesMax != null) setPagesMax(s.pagesMax);
  }, []);

  // Keep URL in sync with current search state (shareable URLs).
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      buildSearchUrlFromState({
        q,
        mode,
        sort,
        dir,
        formats,
        languages,
        tagIds,
        shelfId,
        statuses,
        author,
        publisher,
        addedFrom,
        addedTo,
        pagesMin,
        pagesMax,
      }),
    );
  }, [
    q,
    mode,
    sort,
    dir,
    formats,
    languages,
    tagIds,
    shelfId,
    statuses,
    author,
    publisher,
    addedFrom,
    addedTo,
    pagesMin,
    pagesMax,
  ]);

  async function fetchPage(args: { cursor?: string | null; append: boolean }) {
    setError(null);
    setLoading(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("mode", mode);
    params.set("sort", sort);
    params.set("dir", dir);
    params.set("limit", String(booksPerPage));
    if (args.cursor) params.set("cursor", args.cursor);

    if (formats.length) params.set("formats", toCsv(formats));
    if (languages.length) params.set("languages", toCsv(languages));
    if (tagIds.length) params.set("tagIds", toCsv(tagIds));
    if (shelfId) params.set("shelfId", shelfId);
    if (statuses.length) params.set("statuses", toCsv(statuses));
    if (author.trim()) params.set("author", author.trim());
    if (publisher.trim()) params.set("publisher", publisher.trim());
    if (addedFrom.trim()) params.set("addedFrom", addedFrom.trim());
    if (addedTo.trim()) params.set("addedTo", addedTo.trim());
    if (pagesMin.trim()) params.set("pagesMin", pagesMin.trim());
    if (pagesMax.trim()) params.set("pagesMax", pagesMax.trim());

    try {
      const res = await fetch(`/api/search?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        signal: ac.signal,
      });
      if (!res.ok) throw new Error("Erreur de recherche.");
      const json = (await res.json()) as ApiSearchResponse;
      if (args.append) setItems((prev) => [...prev, ...json.results]);
      else setItems(json.results);
      setNextCursor(json.nextCursor);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  // Debounced initial fetch when queryKey changes.
  useEffect(() => {
    if (searchScope !== "library") return;
    const key = queryKey;
    lastQueryKeyRef.current = key;

    const t = window.setTimeout(() => {
      if (lastQueryKeyRef.current !== key) return;
      setNextCursor(null);
      fetchPage({ cursor: null, append: false }).catch(() => undefined);
    }, 300);

    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, searchScope]);

  // Infinite scroll
  useEffect(() => {
    if (searchScope !== "library") return;
    if (!infiniteScroll) return;
    if (!sentinelRef.current) return;
    if (!nextCursor) return;
    if (loading) return;

    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!nextCursor || loading) return;
        fetchPage({ cursor: nextCursor, append: true }).catch(() => undefined);
      },
      { root: null, rootMargin: "400px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infiniteScroll, nextCursor, loading, queryKey, searchScope]);

  function onToggleFormat(f: string) {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }
  function onToggleLanguage(l: string) {
    setLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));
  }
  function onToggleStatus(s: string) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function onToggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updatePrefs(patch: Partial<SearchPrefs>) {
    startPrefsTransition(async () => {
      const res = await updateSearchPreferencesAction(patch);
      if (res.ok) {
        if (patch.booksPerPage != null) setBooksPerPage(patch.booksPerPage);
        if (patch.libraryInfiniteScroll != null) setInfiniteScroll(patch.libraryInfiniteScroll);
      }
    });
  }

  const anyFilters =
    formats.length ||
    languages.length ||
    tagIds.length ||
    shelfId ||
    statuses.length ||
    author.trim() ||
    publisher.trim() ||
    addedFrom.trim() ||
    addedTo.trim() ||
    pagesMin.trim() ||
    pagesMax.trim();

  async function addCatalogCandidate(candidate: CatalogApiCandidate) {
    const key = `${candidate.provider}:${candidate.providerId}`;
    setCatalogAddFeedback((prev) => ({ ...prev, [key]: "loading" }));
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          intent: "create_from_catalog",
          provider: candidate.provider,
          providerId: candidate.providerId,
          title: candidate.title,
          authors: candidate.authors,
          isbns: candidate.isbns,
          publishDate: candidate.firstPublishYear ? String(candidate.firstPublishYear) : undefined,
          language: candidate.language ?? undefined,
          coverUrl: candidate.coverPreviewUrl ?? undefined,
          query: catalogQ.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { status?: "added" | "already_exists" | "potential_conflict" }
        | null;
      if (!res.ok || !json?.status) {
        setCatalogAddFeedback((prev) => ({ ...prev, [key]: "error" }));
        return;
      }
      setCatalogAddFeedback((prev) => ({ ...prev, [key]: json.status }));
    } catch {
      setCatalogAddFeedback((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={searchScope === "library" ? "default" : "outline"}
          onClick={() => setSearchScope("library")}
        >
          Ma bibliothèque
        </Button>
        <Button
          type="button"
          variant={searchScope === "catalog" ? "default" : "outline"}
          onClick={() => setSearchScope("catalog")}
        >
          Catalogue
        </Button>
      </div>

      {searchScope === "catalog" ? (
        <>
          <Card className="p-4">
            <p className="text-muted-foreground mb-3 text-sm">
              Open Library : aperçu uniquement (aucun livre créé tant que vous ne confirmez pas
              l&apos;ajout).
            </p>
            <Input
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              placeholder="Titre, auteur, ISBN…"
              aria-label="Recherche catalogue externe"
            />
          </Card>

          {catalogError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {catalogError}
            </div>
          )}

          <div className="text-muted-foreground text-sm">
            {catalogLoading
              ? "Recherche…"
              : !catalogQ.trim()
                ? "Saisissez un terme pour lancer la recherche."
                : `${catalogItems.length} résultat(s)`}
          </div>

          <div className="grid gap-3">
            {catalogItems.map((c) => (
              <Card key={c.key} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {c.coverPreviewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.coverPreviewUrl}
                      alt=""
                      className="h-28 w-20 shrink-0 rounded-lg border border-(--eleven-border-subtle) object-cover"
                    />
                  ) : (
                    <div className="bg-muted/40 text-muted-foreground flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-(--eleven-border-subtle) text-xs">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="text-base leading-tight font-semibold">{c.title}</div>
                    <div className="text-muted-foreground text-sm">
                      {(c.authors ?? []).slice(0, 6).join(", ") || "—"}
                      {c.firstPublishYear != null ? ` · ${c.firstPublishYear}` : ""}
                      {c.language ? ` · ${c.language}` : ""}
                      {Number.isFinite(c.relevanceScore)
                        ? ` · score ${(c.relevanceScore * 100).toFixed(0)}`
                        : ""}
                    </div>
                    <div className="text-muted-foreground text-xs uppercase">
                      {c.provider === "googlebooks" ? "Google Books" : "Open Library"}
                    </div>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            catalogAddFeedback[`${c.provider}:${c.providerId}`] === "loading"
                          }
                          onClick={() => {
                            addCatalogCandidate(c).catch(() => undefined);
                          }}
                        >
                          {catalogAddFeedback[`${c.provider}:${c.providerId}`] === "loading"
                            ? "Ajout..."
                            : "Ajouter à la bibliothèque"}
                        </Button>
                        <span className="text-xs">
                          {catalogAddFeedback[`${c.provider}:${c.providerId}`] === "added"
                            ? "Ajouté"
                            : catalogAddFeedback[`${c.provider}:${c.providerId}`] ===
                                  "already_exists"
                              ? "Déjà présent"
                              : catalogAddFeedback[`${c.provider}:${c.providerId}`] ===
                                    "potential_conflict"
                                ? "Conflit potentiel"
                                : catalogAddFeedback[`${c.provider}:${c.providerId}`] === "error"
                                  ? "Erreur"
                                  : ""}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <div className="flex-1">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher (titre, auteurs, sujets, description)…"
                    aria-label="Recherche"
                    data-testid="search-query"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "websearch" | "plain")}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3"
                    aria-label="Mode de requête"
                  >
                    <option value="websearch">Websearch</option>
                    <option value="plain">Plain</option>
                  </select>

                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as typeof sort)}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3"
                    aria-label="Tri"
                  >
                    <option value="relevance">Pertinence</option>
                    <option value="title">Titre</option>
                    <option value="added_at">Date d’ajout</option>
                    <option value="publish_date">Date de publication</option>
                    <option value="author">Auteur</option>
                    <option value="progress">Progression</option>
                    <option value="page_count">Pages</option>
                  </select>

                  <select
                    value={dir}
                    onChange={(e) => setDir(e.target.value as "asc" | "desc")}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3"
                    aria-label="Sens du tri"
                  >
                    <option value="desc">↓</option>
                    <option value="asc">↑</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Préférences</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={String(booksPerPage)}
                      onChange={(e) => updatePrefs({ booksPerPage: Number(e.target.value) })}
                      disabled={busyPrefs}
                      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3 disabled:opacity-50"
                      aria-label="Livres par page"
                    >
                      <option value="12">12 / page</option>
                      <option value="24">24 / page</option>
                      <option value="48">48 / page</option>
                    </select>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={infiniteScroll}
                        onChange={(e) => updatePrefs({ libraryInfiniteScroll: e.target.checked })}
                        disabled={busyPrefs}
                      />
                      Scroll infini
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Filtres rapides</div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {["epub", "physical", "pdf", "cbz", "cbr", "audiobook"].map((f) => (
                      <button
                        key={f}
                        type="button"
                        className={`rounded-full border px-2.5 py-1 ${
                          formats.includes(f)
                            ? "bg-muted/30 border-(--eleven-border-subtle)"
                            : "hover:bg-muted/20 border-(--eleven-border-subtle)"
                        }`}
                        onClick={() => onToggleFormat(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {["fr", "en", "es", "de", "it", "pt", "zh", "ja"].map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={`rounded-full border px-2.5 py-1 ${
                          languages.includes(l)
                            ? "bg-muted/30 border-(--eleven-border-subtle)"
                            : "hover:bg-muted/20 border-(--eleven-border-subtle)"
                        }`}
                        onClick={() => onToggleLanguage(l)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {["not_started", "reading", "finished", "abandoned"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`rounded-full border px-2.5 py-1 ${
                          statuses.includes(s)
                            ? "bg-muted/30 border-(--eleven-border-subtle)"
                            : "hover:bg-muted/20 border-(--eleven-border-subtle)"
                        }`}
                        onClick={() => onToggleStatus(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Filtres avancés</div>
                  <div className="grid gap-2">
                    <select
                      value={shelfId}
                      onChange={(e) => setShelfId(e.target.value)}
                      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-xl border bg-transparent px-2 text-[0.94rem] outline-none focus-visible:ring-3"
                      aria-label="Étagère"
                    >
                      <option value="">Étagère…</option>
                      {initialShelves.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>

                    <Input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="Auteur (contient…)…"
                      aria-label="Auteur"
                    />
                    <Input
                      value={publisher}
                      onChange={(e) => setPublisher(e.target.value)}
                      placeholder="Éditeur (contient…)…"
                      aria-label="Éditeur"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={addedFrom}
                        onChange={(e) => setAddedFrom(e.target.value)}
                        placeholder="Ajouté après (ISO)…"
                        aria-label="Date ajout min"
                      />
                      <Input
                        value={addedTo}
                        onChange={(e) => setAddedTo(e.target.value)}
                        placeholder="Ajouté avant (ISO)…"
                        aria-label="Date ajout max"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={pagesMin}
                        onChange={(e) => setPagesMin(e.target.value)}
                        placeholder="Pages min"
                        aria-label="Pages min"
                      />
                      <Input
                        value={pagesMax}
                        onChange={(e) => setPagesMax(e.target.value)}
                        placeholder="Pages max"
                        aria-label="Pages max"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {initialTags.slice(0, 16).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm ${
                            tagIds.includes(t.id)
                              ? "bg-muted/30 border-(--eleven-border-subtle)"
                              : "hover:bg-muted/20 border-(--eleven-border-subtle)"
                          }`}
                          onClick={() => onToggleTag(t.id)}
                          title={t.name}
                        >
                          <span
                            className="inline-block size-2.5 shrink-0 rounded-full border border-(--eleven-border-subtle)"
                            style={{ background: t.color }}
                            aria-hidden
                          />
                          <span className="max-w-40 truncate">{t.name}</span>
                        </button>
                      ))}
                      {initialTags.length > 16 && (
                        <span className="text-muted-foreground self-center text-xs">
                          +{initialTags.length - 16} tags (filtre complet via URL param `tagIds`)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {anyFilters && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFormats([]);
                      setLanguages([]);
                      setTagIds([]);
                      setShelfId("");
                      setStatuses([]);
                      setAuthor("");
                      setPublisher("");
                      setAddedFrom("");
                      setAddedTo("");
                      setPagesMin("");
                      setPagesMax("");
                    }}
                  >
                    Réinitialiser les filtres
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-3">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="text-muted-foreground text-sm">
              {loading ? "Recherche…" : `${items.length} résultat(s)`}
            </div>

            <div className="grid gap-3">
              {items.map((b) => {
                const authors = authorsToString(b.authors);
                const tagNames = tagIds.map((id) => tagsById.get(id)?.name).filter(Boolean);
                void tagNames;
                return (
                  <Card key={b.id} className="p-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-base font-semibold tracking-tight">
                          {highlight(b.title, terms)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {b.format}
                          {b.language ? ` • ${b.language}` : ""}
                          {b.pageCount ? ` • ${b.pageCount} p.` : ""}
                          {typeof b.progress === "number"
                            ? ` • ${(b.progress * 100).toFixed(0)}%`
                            : ""}
                        </div>
                      </div>

                      {authors && <div className="text-muted-foreground text-sm">{authors}</div>}

                      {b.description && (
                        <div className="text-muted-foreground line-clamp-3 text-sm">
                          {highlight(b.description, terms)}
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>

            {!infiniteScroll && nextCursor && (
              <div>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => fetchPage({ cursor: nextCursor, append: true })}
                >
                  Charger plus
                </Button>
              </div>
            )}

            {infiniteScroll && <div ref={sentinelRef} className="h-10" />}
          </div>
        </>
      )}
    </div>
  );
}
