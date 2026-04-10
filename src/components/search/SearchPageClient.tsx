"use client";

import Link from "next/link";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IsbnBarcodeScanner } from "@/components/book/IsbnBarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  inLibrary?: boolean;
  libraryBookId?: string | null;
};

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function authorLine(c: CatalogApiCandidate) {
  const a = (c.authors ?? []).slice(0, 4).map(normalizeWhitespace).filter(Boolean).join(", ");
  const bits = [a || "—"];
  if (c.firstPublishYear != null) bits.push(String(c.firstPublishYear));
  if (c.language) bits.push(c.language);
  return bits.join(" · ");
}

export function SearchPageClient({
  initialCatalogQ,
  isAdmin = false,
}: {
  initialCatalogQ: string;
  isAdmin?: boolean;
}) {
  const [q, setQ] = useState(initialCatalogQ);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CatalogApiCandidate[]>([]);
  const [addFeedback, setAddFeedback] = useState<
    Partial<
      Record<
        string,
        "idle" | "loading" | "added" | "already_exists" | "potential_conflict" | "error"
      >
    >
  >({});
  const [barcodeHint, setBarcodeHint] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const skipNextUrlSync = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (skipNextUrlSync.current) {
      skipNextUrlSync.current = false;
      return;
    }
    const trimmed = q.trim();
    const params = new URLSearchParams(window.location.search);
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", path);
  }, [q]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError(null);
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
            setItems([]);
            setError(json?.error ?? "Erreur catalogue.");
            return;
          }
          setItems(Array.isArray(json?.candidates) ? json!.candidates! : []);
        } catch {
          if (!cancelled) {
            setItems([]);
            setError("Erreur réseau.");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  async function addCatalogCandidate(candidate: CatalogApiCandidate) {
    const key = `${candidate.provider}:${candidate.providerId}`;
    setAddFeedback((prev) => ({ ...prev, [key]: "loading" }));
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
          query: q.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        status?: "added" | "already_exists" | "potential_conflict";
        bookId?: string;
      } | null;
      if (!res.ok || !json?.status) {
        setAddFeedback((prev) => ({ ...prev, [key]: "error" }));
        return;
      }
      setAddFeedback((prev) => ({ ...prev, [key]: json.status }));
      if (json.bookId) {
        setItems((prev) =>
          prev.map((it) =>
            it.key === candidate.key
              ? { ...it, inLibrary: true, libraryBookId: json.bookId }
              : it,
          ),
        );
      }
    } catch {
      setAddFeedback((prev) => ({ ...prev, [key]: "error" }));
    }
  }

  const showSkeleton = loading && items.length === 0;

  return (
    <div className="catalog-results-enter space-y-4">
      <div className="flex max-w-xl items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="text-eleven-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            ref={inputRef}
            id="catalog-search-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setBarcodeHint(null);
              setScanError(null);
            }}
            placeholder="Titre, auteur, ISBN…"
            aria-label="Recherche catalogue"
            data-testid="catalog-search-query"
            className={cn(
              "eleven-body-airy h-10 rounded-xl border-(--eleven-border-subtle) pr-3 pl-9 shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.06)] transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
              q.length > 0 && "pr-9",
            )}
          />
          {q.length > 0 ? (
            <button
              type="button"
              className="text-eleven-muted hover:bg-muted/80 hover:text-foreground absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors motion-reduce:transition-none"
              aria-label="Effacer la recherche"
              onClick={() => {
                setQ("");
                setBarcodeHint(null);
                setScanError(null);
                inputRef.current?.focus();
              }}
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <IsbnBarcodeScanner
          presentation="modal"
          onIsbnDecoded={(normalized) => {
            setBarcodeHint(null);
            setScanError(null);
            setQ(normalized);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          onRawNotIsbn={() =>
            setBarcodeHint(
              "Code détecté mais pas un ISBN valide (ISSN, code interne, etc.). Saisis l’ISBN à la main ou réessaie.",
            )
          }
          onScanError={(message) => {
            setBarcodeHint(null);
            setScanError(message);
          }}
        />
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {scanError ? (
        <p className="text-destructive text-sm" role="alert">
          {scanError}
        </p>
      ) : null}
      {barcodeHint ? (
        <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-200/90" role="status">
          {barcodeHint}
        </p>
      ) : null}

      <p className="text-eleven-muted min-h-[1.25rem] text-sm">
        {loading ? (
          <span className="catalog-loading-dots">Recherche…</span>
        ) : q.trim() ? (
          `${items.length} résultat${items.length !== 1 ? "s" : ""}`
        ) : null}
      </p>

      {showSkeleton ? (
        <ul className="grid list-none gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li
              key={i}
              className="catalog-skeleton-card flex gap-3 rounded-xl border border-(--eleven-border-subtle) p-3"
              style={{ "--catalog-skeleton-delay": `${i * 70}ms` } as React.CSSProperties}
            >
              <div className="bg-muted catalog-skeleton-stagger h-[7.25rem] w-20 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2 py-0.5">
                <div className="bg-muted catalog-skeleton-stagger h-3.5 w-full max-w-[90%] rounded" />
                <div className="bg-muted catalog-skeleton-stagger h-3 w-full max-w-[55%] rounded" />
              </div>
            </li>
          ))}
        </ul>
      ) : !q.trim() ? null : items.length === 0 && !loading ? (
        <p className="text-eleven-muted text-sm">Aucun résultat.</p>
      ) : (
        <ul className="grid list-none gap-3 sm:grid-cols-2">
          {items.map((c, index) => (
            <li
              key={c.key}
              className={cn(
                "catalog-card-enter flex gap-3 rounded-xl border border-(--eleven-border-subtle) p-3 shadow-eleven-card transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-eleven-button-white motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-eleven-card",
              )}
              style={
                { "--catalog-enter-delay": `${Math.min(index, 19) * 45}ms` } as React.CSSProperties
              }
            >
              {c.coverPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.coverPreviewUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-[7.25rem] w-20 shrink-0 rounded-lg border border-(--eleven-border-subtle) bg-muted/30 object-cover"
                />
              ) : (
                <div className="bg-muted/40 text-eleven-muted flex h-[7.25rem] w-20 shrink-0 items-center justify-center rounded-lg border border-(--eleven-border-subtle) text-xs">
                  —
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm leading-snug font-medium">{c.title}</p>
                  {c.inLibrary && c.libraryBookId ? (
                    <Link
                      href={`/book/${c.libraryBookId}`}
                      className="bg-secondary text-secondary-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-(--eleven-border-subtle) transition-opacity hover:opacity-90"
                    >
                      Dans ma biblio
                    </Link>
                  ) : null}
                </div>
                <p className="text-eleven-muted mt-1 text-xs leading-relaxed">{authorLine(c)}</p>
                <p className="text-eleven-muted mt-0.5 text-[10px] uppercase tracking-wide">
                  {c.provider === "googlebooks" ? "Google Books" : "Open Library"}
                </p>
                {isAdmin && !c.inLibrary ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs"
                      disabled={addFeedback[`${c.provider}:${c.providerId}`] === "loading"}
                      onClick={() => {
                        addCatalogCandidate(c).catch(() => undefined);
                      }}
                    >
                      {addFeedback[`${c.provider}:${c.providerId}`] === "loading"
                        ? "Ajout…"
                        : "Ajouter"}
                    </Button>
                    <span className="text-eleven-muted text-xs">
                      {addFeedback[`${c.provider}:${c.providerId}`] === "added"
                        ? "Ajouté"
                        : addFeedback[`${c.provider}:${c.providerId}`] === "already_exists"
                          ? "Déjà présent"
                          : addFeedback[`${c.provider}:${c.providerId}`] === "potential_conflict"
                            ? "Conflit"
                            : addFeedback[`${c.provider}:${c.providerId}`] === "error"
                              ? "Erreur"
                              : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
