"use client";

import { Fragment, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { OpenLibraryCandidate } from "@/app/(app)/book/[id]/openlibraryActions";
import {
  openLibraryApplyEnrichmentAction,
  openLibraryPreviewIsbnAction,
  openLibrarySearchForBookAction,
} from "@/app/(app)/book/[id]/openlibraryActions";

type Enrichment =
  Awaited<ReturnType<typeof openLibraryPreviewIsbnAction>> extends {
    ok: true;
    enrichment: infer E;
  }
    ? E
    : never;

type UiState =
  | { type: "idle" }
  | { type: "searching" }
  | { type: "candidates"; items: OpenLibraryCandidate[] }
  | { type: "previewing" }
  | { type: "ready"; isbn: string; enrichment: Enrichment }
  | { type: "applying" }
  | { type: "done"; coverUpdated: boolean }
  | { type: "error"; message: string };

export function OpenLibraryEnrichmentPanel({
  bookId,
  hasCover,
  currentIsbn,
}: {
  bookId: string;
  hasCover: boolean;
  currentIsbn: string | null;
}) {
  const [state, setState] = useState<UiState>({ type: "idle" });
  const [isbn, setIsbn] = useState(currentIsbn ?? "");
  const [forceCover, setForceCover] = useState(false);
  const [applyCoverIfMissing, setApplyCoverIfMissing] = useState(true);
  const [pending, start] = useTransition();

  const canSearch = useMemo(() => !pending && state.type !== "applying", [pending, state.type]);
  const canPreview = useMemo(
    () => !pending && Boolean(isbn.trim()) && state.type !== "applying",
    [pending, isbn, state.type],
  );
  const canApply = useMemo(
    () => !pending && state.type === "ready" && state.type !== "applying",
    [pending, state.type],
  );

  function onSearch() {
    if (!canSearch) return;
    setState({ type: "searching" });
    start(async () => {
      const res = await openLibrarySearchForBookAction({ bookId }).catch(() => null);
      if (!res || !res.ok) {
        setState({ type: "error", message: res?.error ?? "Erreur Open Library." });
        return;
      }
      setState({ type: "candidates", items: res.candidates });
    });
  }

  function onPreview() {
    if (!canPreview) return;
    const clean = isbn.trim();
    setState({ type: "previewing" });
    start(async () => {
      const res = await openLibraryPreviewIsbnAction({ isbn: clean }).catch(() => null);
      if (!res || !res.ok) {
        setState({ type: "error", message: res?.error ?? "Erreur Open Library." });
        return;
      }
      setState({ type: "ready", isbn: clean, enrichment: res.enrichment });
    });
  }

  function onPickCandidate(c: OpenLibraryCandidate) {
    const firstIsbn = c.isbns?.[0];
    if (!firstIsbn) {
      setState({ type: "error", message: "Ce résultat ne fournit pas d’ISBN exploitable." });
      return;
    }
    setIsbn(firstIsbn);
    setState({ type: "candidates", items: state.type === "candidates" ? state.items : [] });
  }

  function onApply() {
    if (state.type !== "ready") return;
    setState({ type: "applying" });
    start(async () => {
      const res = await openLibraryApplyEnrichmentAction({
        bookId,
        isbn: state.isbn,
        applyCoverIfMissing,
        forceCover,
      }).catch(() => null);
      if (!res || !res.ok) {
        setState({ type: "error", message: res?.error ?? "Erreur application." });
        return;
      }
      setState({ type: "done", coverUpdated: res.coverUpdated });
    });
  }

  return (
    <Card size="sm" variant="default">
      <CardHeader className="border-b">
        <CardTitle>Enrichissement Open Library</CardTitle>
        <CardDescription>
          Recherche titre+auteur → sélection → prévisualisation → application (confirmation admin).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">ISBN</div>
            <Input
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="10/13 chiffres, tirets OK"
              disabled={pending}
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Button type="button" variant="outline" onClick={onSearch} disabled={!canSearch}>
              {state.type === "searching" ? "Recherche…" : "Rechercher (titre+auteur)"}
            </Button>
            <Button type="button" onClick={onPreview} disabled={!canPreview}>
              {state.type === "previewing" ? "Prévisualisation…" : "Prévisualiser (ISBN)"}
            </Button>
          </div>
        </div>

        <div className="bg-muted/20 rounded-xl border border-(--eleven-border-subtle) px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-muted-foreground text-xs">
              Cover : {hasCover ? "déjà présente" : "absente"}.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={applyCoverIfMissing}
                  onChange={(e) => setApplyCoverIfMissing(e.target.checked)}
                  disabled={pending}
                />
                Télécharger cover si manquante
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={forceCover}
                  onChange={(e) => setForceCover(e.target.checked)}
                  disabled={pending}
                />
                Forcer refresh cover
              </label>
            </div>
          </div>
          {!hasCover && (
            <div className="text-muted-foreground mt-1 text-xs">
              La cover sera stockée côté serveur et servie via l’endpoint authentifié.
            </div>
          )}
        </div>

        {state.type === "error" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.message}
          </div>
        )}

        {state.type === "candidates" && (
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs">Candidats</div>
            {state.items.length === 0 ? (
              <div className="text-muted-foreground text-sm">Aucun résultat.</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-(--eleven-border-subtle)">
                <div className="grid grid-cols-1 gap-px bg-(--eleven-border-subtle)">
                  {state.items.map((c) => (
                    <Fragment key={c.key}>
                      <button
                        type="button"
                        onClick={() => onPickCandidate(c)}
                        className="bg-background hover:bg-muted/30 px-3 py-2 text-left"
                        disabled={pending}
                      >
                        <div className="text-sm font-medium">{c.title}</div>
                        <div className="text-muted-foreground text-xs">
                          {c.authors?.join(", ") || "—"}{" "}
                          {c.firstPublishYear ? `· ${c.firstPublishYear}` : ""}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          ISBN: {(c.isbns ?? []).slice(0, 3).join(", ") || "—"}
                        </div>
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {state.type === "ready" && (
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs">Prévisualisation</div>
            <div className="bg-muted/20 rounded-xl border border-(--eleven-border-subtle) px-3 py-2 text-sm">
              <div>
                <span className="text-muted-foreground">Open Library ID:</span>{" "}
                {state.enrichment.openLibraryId ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Pages:</span>{" "}
                {state.enrichment.pageCount ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Sujets:</span>{" "}
                {(state.enrichment.subjects ?? []).slice(0, 10).join(", ") || "—"}
              </div>
              <div className="mt-1">
                <span className="text-muted-foreground">Description:</span>{" "}
                {state.enrichment.description ? state.enrichment.description.slice(0, 240) : "—"}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button type="button" onClick={onApply} disabled={!canApply}>
          {state.type === "applying" ? "Application…" : "Appliquer (confirmer)"}
        </Button>
        {state.type === "done" && (
          <div className="text-muted-foreground text-xs">
            Appliqué{state.coverUpdated ? " (cover mise à jour)" : ""}.
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
