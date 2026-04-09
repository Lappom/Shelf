"use client";

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IsbnBarcodeScanner } from "@/components/book/IsbnBarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Candidate = {
  key: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  isbns: string[];
};

type Enrichment = {
  openLibraryId: string | null;
  description: string | null;
  subjects: string[];
  pageCount: number | null;
  coverUrl: string | null;
};

type UiState =
  | { type: "idle" }
  | { type: "searching" }
  | { type: "candidates"; items: Candidate[] }
  | { type: "previewing" }
  | { type: "ready"; enrichment: Enrichment }
  | { type: "creating" }
  | { type: "done"; bookId: string }
  | { type: "error"; message: string };

function splitAuthorsCsv(raw: string) {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function AddPhysicalBookDialog({
  triggerText = "Ajouter un livre physique",
}: {
  triggerText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UiState>({ type: "idle" });

  const [title, setTitle] = useState("");
  const [authorsCsv, setAuthorsCsv] = useState("");
  const [isbn, setIsbn] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [language, setLanguage] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [subjectsCsv, setSubjectsCsv] = useState("");
  const [description, setDescription] = useState("");
  const [applyOpenLibrary, setApplyOpenLibrary] = useState(true);
  const [cover, setCover] = useState<File | null>(null);
  const [barcodeHint, setBarcodeHint] = useState<string | null>(null);

  const canSearch = useMemo(
    () => Boolean(title.trim()) && Boolean(authorsCsv.trim()) && state.type !== "creating",
    [title, authorsCsv, state.type],
  );
  const canCreate = useMemo(
    () =>
      Boolean(title.trim()) && splitAuthorsCsv(authorsCsv).length > 0 && state.type !== "creating",
    [title, authorsCsv, state.type],
  );

  function reset() {
    setState({ type: "idle" });
    setTitle("");
    setAuthorsCsv("");
    setIsbn("");
    setPublisher("");
    setPublishDate("");
    setLanguage("");
    setPageCount("");
    setSubjectsCsv("");
    setDescription("");
    setApplyOpenLibrary(true);
    setCover(null);
    setBarcodeHint(null);
  }

  async function previewByIsbn(isbnToUse: string) {
    setState({ type: "previewing" });
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "openlibrary_preview_isbn", isbn: isbnToUse }),
    }).catch(() => null);

    if (!res) {
      setState({ type: "error", message: "Requête impossible. Réessaie." });
      return;
    }

    const json = (await res.json().catch(() => null)) as {
      enrichment?: Enrichment;
      error?: string;
    } | null;
    if (!res.ok || !json?.enrichment) {
      setState({ type: "error", message: json?.error ?? "Erreur Open Library." });
      return;
    }

    setState({ type: "ready", enrichment: json.enrichment });
    if (!description.trim() && json.enrichment.description)
      setDescription(json.enrichment.description);
    if (!subjectsCsv.trim() && json.enrichment.subjects?.length)
      setSubjectsCsv(json.enrichment.subjects.join(", "));
    if (!pageCount.trim() && json.enrichment.pageCount)
      setPageCount(String(json.enrichment.pageCount));
  }

  async function searchOpenLibrary() {
    if (!canSearch) return;
    const authors = splitAuthorsCsv(authorsCsv);
    if (!authors.length) {
      setState({ type: "error", message: "Auteurs requis (CSV)." });
      return;
    }

    if (isbn.trim()) {
      await previewByIsbn(isbn.trim());
      return;
    }

    setState({ type: "searching" });
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "openlibrary_search",
        title: title.trim(),
        author: authors[0],
      }),
    }).catch(() => null);

    if (!res) {
      setState({ type: "error", message: "Requête impossible. Réessaie." });
      return;
    }

    const json = (await res.json().catch(() => null)) as {
      candidates?: Candidate[];
      error?: string;
    } | null;
    if (!res.ok) {
      setState({ type: "error", message: json?.error ?? "Erreur Open Library." });
      return;
    }

    const items = Array.isArray(json?.candidates) ? json!.candidates! : [];
    setState({ type: "candidates", items });
  }

  async function onPickCandidate(c: Candidate) {
    const firstIsbn = c.isbns?.[0];
    if (!firstIsbn) {
      setState({ type: "error", message: "Ce résultat ne fournit pas d’ISBN exploitable." });
      return;
    }
    setIsbn(firstIsbn);
    await previewByIsbn(firstIsbn);
  }

  async function create() {
    if (!canCreate) return;
    setState({ type: "creating" });

    const fd = new FormData();
    fd.set("format", "physical");
    fd.set("title", title.trim());
    fd.set("authors", authorsCsv.trim());
    if (isbn.trim()) fd.set("isbn", isbn.trim());
    if (publisher.trim()) fd.set("publisher", publisher.trim());
    if (publishDate.trim()) fd.set("publishDate", publishDate.trim());
    if (language.trim()) fd.set("language", language.trim());
    if (pageCount.trim()) fd.set("pageCount", pageCount.trim());
    if (subjectsCsv.trim()) fd.set("subjects", subjectsCsv.trim());
    if (description.trim()) fd.set("description", description.trim());
    fd.set("applyOpenLibrary", applyOpenLibrary ? "true" : "false");
    if (cover) fd.set("cover", cover);

    const res = await fetch("/api/books", { method: "POST", body: fd }).catch(() => null);
    if (!res) {
      setState({ type: "error", message: "Création impossible. Réessaie." });
      return;
    }

    const json = (await res.json().catch(() => null)) as { bookId?: string; error?: string } | null;
    if (!res.ok || !json?.bookId) {
      setState({ type: "error", message: json?.error ?? "Erreur création." });
      return;
    }

    setState({ type: "done", bookId: json.bookId });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button variant="default" onClick={() => setOpen(true)}>
        {triggerText}
      </Button>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter un livre physique</DialogTitle>
          <DialogDescription className="text-eleven-secondary eleven-body-airy">
            Création réservée admin. Optionnellement, auto-complétion via Open Library (ISBN ou
            recherche titre+auteur).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Titre</div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Fondation"
              />
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Auteurs (CSV)</div>
              <Input
                value={authorsCsv}
                onChange={(e) => setAuthorsCsv(e.target.value)}
                placeholder="Ex: Isaac Asimov"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-muted-foreground text-xs">ISBN (optionnel)</div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={isbn}
                    onChange={(e) => {
                      setIsbn(e.target.value);
                      setBarcodeHint(null);
                    }}
                    placeholder="10/13 chiffres, tirets OK"
                    autoComplete="off"
                  />
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Douchette USB : place le curseur dans ce champ puis scanne (saisie clavier). Caméra
                    : HTTPS recommandé ; certains codes (magazines ISSN, anciens formats) ne sont pas des
                    ISBN reconnus ici.
                  </p>
                  {barcodeHint && (
                    <p className="text-amber-800 text-xs leading-relaxed">{barcodeHint}</p>
                  )}
                </div>
                <div className="shrink-0 lg:max-w-[min(100%,280px)] lg:pt-0">
                  <IsbnBarcodeScanner
                    disabled={state.type === "creating"}
                    onIsbnDecoded={async (normalized) => {
                      setBarcodeHint(null);
                      setIsbn(normalized);
                      if (applyOpenLibrary) {
                        await previewByIsbn(normalized);
                      }
                    }}
                    onRawNotIsbn={() =>
                      setBarcodeHint(
                        "Code détecté mais pas un ISBN valide (ISSN, code interne, etc.). Tu peux corriger ou saisir l’ISBN à la main.",
                      )
                    }
                    onScanError={(message) => {
                      setBarcodeHint(null);
                      setState({ type: "error", message });
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Langue</div>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="Ex: fr"
              />
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Éditeur</div>
              <Input
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="Ex: Denoël"
              />
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Date de publication</div>
              <Input
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                placeholder="Ex: 1951"
              />
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Pages</div>
              <Input
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="Ex: 255"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">Couverture (optionnel)</div>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setCover(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">Sujets (CSV)</div>
            <Input
              value={subjectsCsv}
              onChange={(e) => setSubjectsCsv(e.target.value)}
              placeholder="Ex: Science Fiction, Classics"
            />
          </div>

          <div className="space-y-1">
            <div className="text-muted-foreground text-xs">Description</div>
            <textarea
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 eleven-body-airy min-h-24 w-full rounded-2xl border bg-transparent px-3 py-2 text-[0.94rem] outline-none focus-visible:ring-3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionnel (peut être auto-complété)"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={searchOpenLibrary}
              disabled={!canSearch || state.type === "searching" || state.type === "previewing"}
            >
              {isbn.trim() ? "Prévisualiser Open Library (ISBN)" : "Rechercher sur Open Library"}
            </Button>
            <Button
              type="button"
              variant={applyOpenLibrary ? "default" : "outline"}
              onClick={() => setApplyOpenLibrary((v) => !v)}
              disabled={state.type === "creating"}
            >
              {applyOpenLibrary ? "Auto-complétion ON" : "Auto-complétion OFF"}
            </Button>
          </div>

          {state.type === "candidates" && (
            <div className="bg-muted/30 rounded-2xl border border-(--eleven-border-subtle) p-3">
              <div className="text-muted-foreground mb-2 text-xs">
                Confirme un résultat Open Library
              </div>
              <div className="max-h-48 space-y-2 overflow-auto pr-1">
                {state.items.length === 0 && (
                  <div className="text-muted-foreground text-sm">Aucun résultat.</div>
                )}
                {state.items.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="hover:bg-muted/60 w-full rounded-xl border border-transparent px-2 py-2 text-left transition-colors"
                    onClick={() => void onPickCandidate(c)}
                  >
                    <div className="text-sm">{c.title}</div>
                    <div className="text-muted-foreground text-xs">
                      {(c.authors ?? []).slice(0, 3).join(", ")}
                      {c.firstPublishYear ? ` · ${c.firstPublishYear}` : ""}
                      {c.isbns?.[0] ? ` · ISBN: ${c.isbns[0]}` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {state.type === "ready" && (
            <div className="bg-muted/30 rounded-2xl border border-(--eleven-border-subtle) px-3 py-2 text-sm">
              Open Library prêt. Champs suggérés appliqués (description/sujets/pages si vides).
            </div>
          )}

          {state.type === "done" && (
            <div className="bg-muted/30 rounded-2xl border border-(--eleven-border-subtle) px-3 py-2 text-sm">
              Création OK.{" "}
              <a className="underline underline-offset-3" href={`/reader/${state.bookId}`}>
                Ouvrir
              </a>
            </div>
          )}

          {state.type === "error" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={state.type === "creating"}
          >
            Annuler
          </Button>
          <Button onClick={() => void create()} disabled={!canCreate}>
            {state.type === "creating" ? "Création…" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
