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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UploadState =
  | { type: "idle" }
  | { type: "uploading" }
  | { type: "done"; bookId: string; restored: boolean }
  | { type: "error"; message: string; existingBookId?: string };

export function UploadEpubDialog({ triggerText = "Ajouter un EPUB" }: { triggerText?: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>({ type: "idle" });

  const canSubmit = useMemo(() => Boolean(file) && state.type !== "uploading", [file, state.type]);

  async function onUpload() {
    if (!file) return;
    setState({ type: "uploading" });

    const fd = new FormData();
    fd.set("file", file);

    let res: Response;
    try {
      res = await fetch("/api/books", { method: "POST", body: fd });
    } catch {
      setState({ type: "error", message: "Upload impossible. Réessaie." });
      return;
    }

    const json = (await res.json().catch(() => null)) as {
      bookId?: string;
      restored?: boolean;
      error?: string;
      existingBookId?: string;
    } | null;

    if (!res.ok) {
      setState({
        type: "error",
        message: json?.error ?? "Erreur upload.",
        existingBookId: json?.existingBookId,
      });
      return;
    }

    if (!json?.bookId) {
      setState({ type: "error", message: "Réponse serveur invalide." });
      return;
    }

    setState({ type: "done", bookId: json.bookId, restored: Boolean(json.restored) });
  }

  function reset() {
    setFile(null);
    setState({ type: "idle" });
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

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer un EPUB</DialogTitle>
          <DialogDescription className="text-eleven-secondary eleven-body-airy">
            Upload réservé admin. Le fichier est stocké côté serveur et les métadonnées sont
            extraites automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="file"
            accept=".epub,application/epub+zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          {state.type === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.message}
              {state.existingBookId && (
                <div className="mt-1">
                  Livre existant :{" "}
                  <a
                    className="underline underline-offset-3"
                    href={`/reader/${state.existingBookId}`}
                  >
                    ouvrir
                  </a>
                </div>
              )}
            </div>
          )}

          {state.type === "done" && (
            <div className="bg-muted/30 rounded-xl border border-(--eleven-border-subtle) px-3 py-2 text-sm">
              Import OK.{" "}
              <a className="underline underline-offset-3" href={`/reader/${state.bookId}`}>
                Ouvrir dans le reader
              </a>
              {state.restored && <span className="text-muted-foreground"> (restauré)</span>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={state.type === "uploading"}
          >
            Annuler
          </Button>
          <Button onClick={onUpload} disabled={!canSubmit}>
            {state.type === "uploading" ? "Upload…" : "Importer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
