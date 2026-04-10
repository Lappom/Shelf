"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PullItem = {
  status: "created" | "skipped";
  title: string;
  authors: string[];
  open_library_id: string | null;
  isbn_13: string | null;
};

type PullResponse = {
  created: number;
  skipped: number;
  nextCursor: string | null;
  items: PullItem[];
};

export function AdminPullBooksClient() {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [dryRun, setDryRun] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [last, setLast] = useState<PullResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runPull = useCallback(
    async (mode: "first" | "continue") => {
      setError(null);
      if (mode === "first") setNextCursor(null);
      setBusy(true);
      try {
        const body =
          mode === "continue" && nextCursor
            ? { source: "openlibrary" as const, cursor: nextCursor, limit, dryRun }
            : {
                source: "openlibrary" as const,
                query: query.trim(),
                limit,
                dryRun,
              };

        const res = await fetch("/api/admin/pull-books", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });

        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          created?: number;
          skipped?: number;
          nextCursor?: string | null;
          items?: PullItem[];
        };

        if (!res.ok) {
          setError(json.error || `Erreur ${res.status}`);
          return;
        }

        const out: PullResponse = {
          created: json.created ?? 0,
          skipped: json.skipped ?? 0,
          nextCursor: json.nextCursor ?? null,
          items: json.items ?? [],
        };
        setLast(out);
        setNextCursor(out.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
      } finally {
        setBusy(false);
      }
    },
    [query, limit, dryRun, nextCursor],
  );

  return (
    <div className="space-y-6">
      <div className="grid max-w-xl gap-4 rounded-2xl border border-black/5 bg-white p-6 shadow-eleven-card">
        <div className="space-y-2">
          <label htmlFor="pull-query" className="text-sm font-medium">
            Requête Open Library
          </label>
          <Input
            id="pull-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex. bible, science fiction…"
            disabled={busy}
            className="rounded-xl"
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <label htmlFor="pull-limit" className="text-sm font-medium">
              Limite (1–50)
            </label>
            <Input
              id="pull-limit"
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) || 20)}
              disabled={busy}
              className="w-24 rounded-xl"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={busy}
              className="size-4 rounded border"
            />
            Dry-run (aucune écriture)
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy || !query.trim()}
            className="rounded-eleven-pill"
            onClick={() => void runPull("first")}
          >
            Lancer le pull
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !nextCursor}
            className="rounded-eleven-pill"
            onClick={() => void runPull("continue")}
          >
            Continuer (page suivante)
          </Button>
        </div>
        {nextCursor === null && last && (
          <p className="text-muted-foreground text-xs">Fin du catalogue pour cette requête.</p>
        )}
      </div>

      {error ? (
        <div className="text-destructive rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      {last ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            Créés : {last.created} · Ignorés : {last.skipped}
            {dryRun ? " (simulation)" : ""}
          </p>
          <div className="overflow-x-auto rounded-2xl border border-black/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2">Titre</th>
                  <th className="px-3 py-2">Auteurs</th>
                  <th className="px-3 py-2">OL ID</th>
                  <th className="px-3 py-2">ISBN-13</th>
                </tr>
              </thead>
              <tbody>
                {last.items.map((it, i) => (
                  <tr key={`${it.open_library_id ?? it.title}-${i}`} className="border-t border-black/5">
                    <td className="px-3 py-2">{it.status}</td>
                    <td className="px-3 py-2">{it.title}</td>
                    <td className="px-3 py-2">{it.authors.join(", ")}</td>
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {it.open_library_id ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                      {it.isbn_13 ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
