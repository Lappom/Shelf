"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importCalibreAction, type CalibreImportResult } from "./actions";

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsvRow(cols: string[]) {
  return cols
    .map((c) => {
      const s = String(c ?? "");
      if (/[\",\\n]/.test(s)) return `"${s.replace(/\"/g, '""')}"`;
      return s;
    })
    .join(",");
}

function resultToCsv(res: CalibreImportResult) {
  const rows: string[] = [];
  rows.push(
    toCsvRow([
      "type",
      "calibreBookId",
      "bookId",
      "title",
      "contentHash",
      "reason",
      "existingBookId",
      "errorCode",
      "message",
    ]),
  );

  for (const r of res.imported) {
    rows.push(
      toCsvRow([
        "imported",
        String(r.calibreBookId),
        r.bookId,
        r.title,
        r.contentHash,
        "",
        "",
        "",
        "",
      ]),
    );
  }
  for (const r of res.ignored) {
    rows.push(
      toCsvRow([
        "ignored",
        String(r.calibreBookId),
        "",
        r.title,
        "",
        r.reason,
        r.existingBookId,
        "",
        "",
      ]),
    );
  }
  for (const e of res.errors) {
    rows.push(
      toCsvRow(["error", String(e.calibreBookId), "", e.title, "", "", "", e.code, e.message]),
    );
  }
  return rows.join("\n");
}

export function ImportCalibreClient() {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibreImportResult | null>(null);

  const summary = useMemo(() => {
    if (!result) return null;
    const { stats } = result;
    return `${stats.imported} importé(s), ${stats.ignoredDuplicates} ignoré(s), ${stats.errors} erreur(s)`;
  }, [result]);

  async function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await importCalibreAction(formData);
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur");
      }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form action={onSubmit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="metadataDb">
              metadata.db
            </label>
            <Input id="metadataDb" name="metadataDb" type="file" accept=".db" required />
            <p className="text-muted-foreground text-xs">
              Le fichier SQLite de Calibre (exporté/copied depuis ta librairie).
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="calibreLibraryRoot">
              Calibre library root (chemin serveur)
            </label>
            <Input
              id="calibreLibraryRoot"
              name="calibreLibraryRoot"
              type="text"
              placeholder="D:\\Calibre Library"
              required
            />
            <p className="text-muted-foreground text-xs">
              Doit être monté en volume côté serveur. Les chemins absolus ne sont jamais exposés
              dans le rapport.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm select-none">
            <input name="dryRun" type="checkbox" className="h-4 w-4" defaultChecked />
            Dry run (ne crée rien)
          </label>
          <label className="flex items-center gap-2 text-sm select-none">
            <input name="skipCovers" type="checkbox" className="h-4 w-4" />
            Ignorer couvertures
          </label>
          <label className="flex items-center gap-2 text-sm select-none">
            <span className="text-sm">Limit</span>
            <Input
              name="limit"
              type="number"
              min={1}
              className="h-8 w-28 rounded-lg"
              placeholder="(tout)"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? "Import…" : "Lancer l’import"}
          </Button>

          {result && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  downloadText(
                    "calibre-import-report.json",
                    JSON.stringify(result, null, 2),
                    "application/json",
                  )
                }
              >
                Export JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  downloadText("calibre-import-report.csv", resultToCsv(result), "text/csv")
                }
              >
                Export CSV
              </Button>
            </>
          )}
        </div>
      </form>

      {result && (
        <div className="space-y-4">
          <div className="bg-muted/20 rounded-2xl border border-(--eleven-border-subtle) px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">
                Résultat {result.dryRun ? "(dry run)" : ""} — {summary}
              </div>
              <div className="text-muted-foreground text-xs">
                Total DB: {result.stats.totalInDb}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-xs">
                {result.warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Erreurs</h2>
            <div className="overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 font-medium">Calibre ID</th>
                    <th className="px-3 py-2 font-medium">Titre</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e) => (
                    <tr
                      key={`${e.calibreBookId}-${e.code}`}
                      className="border-t border-(--eleven-border-subtle)"
                    >
                      <td className="text-muted-foreground px-3 py-2">{e.calibreBookId}</td>
                      <td className="px-3 py-2">{e.title}</td>
                      <td className="text-muted-foreground px-3 py-2">{e.code}</td>
                      <td className="text-muted-foreground px-3 py-2">{e.message}</td>
                    </tr>
                  ))}
                  {!result.errors.length && (
                    <tr>
                      <td className="text-muted-foreground px-3 py-3" colSpan={4}>
                        Aucune erreur.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
