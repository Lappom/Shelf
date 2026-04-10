"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  TestTube2,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import { importCalibreAction, type CalibreImportResult } from "./actions";

/** Must stay in sync with MAX_METADATA_DB_BYTES in actions.ts */
const MAX_METADATA_DB_BYTES = 50 * 1024 * 1024;

type ResultTab = "imported" | "ignored" | "errors";

const TAB_ORDER: ResultTab[] = ["imported", "ignored", "errors"];

const TAB_IDS = {
  imported: "import-tab-imported",
  ignored: "import-tab-ignored",
  errors: "import-tab-errors",
} as const;

const PANEL_IDS = {
  imported: "import-panel-imported",
  ignored: "import-panel-ignored",
  errors: "import-panel-errors",
} as const;

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}

function toCsvRow(cols: string[]) {
  return cols
    .map((c) => {
      const s = String(c ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
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

function StatCard({ label, value, delayMs }: { label: string; value: number; delayMs: number }) {
  return (
    <div
      className="admin-import-stat-enter border-(--eleven-border-subtle) bg-card shadow-eleven-card rounded-xl border px-4 py-3"
      style={{ "--admin-import-delay": `${delayMs}ms` } as React.CSSProperties}
    >
      <div className="text-eleven-muted text-xs font-medium tracking-wide uppercase">{label}</div>
      <div className="font-heading mt-1 text-2xl font-light tabular-nums">{value}</div>
    </div>
  );
}

export function ImportCalibreClient() {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibreImportResult | null>(null);
  const [fileHint, setFileHint] = useState<{ name: string; size: number } | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("imported");

  const fileOverLimit = fileHint !== null && fileHint.size > MAX_METADATA_DB_BYTES;

  const summary = useMemo(() => {
    if (!result) return null;
    const { stats } = result;
    return `${stats.imported} importé(s), ${stats.ignoredDuplicates} ignoré(s), ${stats.errors} erreur(s)`;
  }, [result]);

  const onDbFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFileHint(f ? { name: f.name, size: f.size } : null);
  }, []);

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      const raw = fd.get("metadataDb");
      if (!(raw instanceof File) || raw.size === 0) {
        setError("Choisis un fichier metadata.db.");
        return;
      }
      if (raw.size > MAX_METADATA_DB_BYTES) {
        setError(
          `Le fichier dépasse ${MAX_METADATA_DB_BYTES / 1024 / 1024} Mo (limite serveur).`,
        );
        return;
      }
      setError(null);
      startTransition(async () => {
        try {
          const res = await importCalibreAction(fd);
          setResult(res);
          if (res.errors.length > 0 && res.imported.length === 0) {
            setActiveTab("errors");
          } else {
            setActiveTab("imported");
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erreur");
        }
      });
    },
    [startTransition],
  );

  const onTabListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        e.key !== "ArrowRight" &&
        e.key !== "ArrowLeft" &&
        e.key !== "Home" &&
        e.key !== "End"
      ) {
        return;
      }
      e.preventDefault();
      let i = TAB_ORDER.indexOf(activeTab);
      if (e.key === "ArrowRight") i = (i + 1) % TAB_ORDER.length;
      else if (e.key === "ArrowLeft") i = (i - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = TAB_ORDER.length - 1;
      const next = TAB_ORDER[i]!;
      setActiveTab(next);
      requestAnimationFrame(() => document.getElementById(TAB_IDS[next])?.focus());
    },
    [activeTab],
  );

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="admin-import-panel-enter rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <Card
        className="admin-import-panel-enter border-(--eleven-border-subtle)"
        style={{ "--admin-import-panel-delay": "0ms" } as React.CSSProperties}
      >
        <CardHeader className="border-b border-(--eleven-border-subtle)">
          <CardTitle>Préparation</CardTitle>
          <CardDescription>
            Vérifie les prérequis puis envoie le formulaire. Commence par un dry run.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ul className="text-eleven-secondary mb-6 grid gap-3 text-sm sm:grid-cols-3">
            <li className="flex gap-2">
              <Database className="text-eleven-muted mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="text-foreground font-medium">metadata.db</span> — export SQLite
                depuis ta bibliothèque Calibre.
              </span>
            </li>
            <li className="flex gap-2">
              <FolderOpen className="text-eleven-muted mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="text-foreground font-medium">Chemin racine</span> — dossier
                Calibre monté sur le serveur (volume Docker, etc.).
              </span>
            </li>
            <li className="flex gap-2">
              <TestTube2 className="text-eleven-muted mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="text-foreground font-medium">Dry run</span> — simule l’import sans
                écrire en base.
              </span>
            </li>
          </ul>

          <form onSubmit={handleFormSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="metadataDb">
                  Fichier metadata.db
                </label>
                <Input
                  id="metadataDb"
                  name="metadataDb"
                  type="file"
                  accept=".db,application/octet-stream"
                  required
                  onChange={onDbFileChange}
                  className={cn(
                    "cursor-pointer file:cursor-pointer",
                    fileOverLimit && "border-destructive ring-1 ring-destructive/30",
                  )}
                />
                {fileHint && (
                  <p
                    className={cn(
                      "text-xs",
                      fileOverLimit ? "font-medium text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {fileHint.name} — {formatBytes(fileHint.size)}
                    {fileOverLimit
                      ? ` (dépasse ${MAX_METADATA_DB_BYTES / 1024 / 1024} Mo)`
                      : null}
                  </p>
                )}
                {!fileHint && (
                  <p className="text-muted-foreground text-xs">
                    Fichier SQLite Calibre. Taille max {MAX_METADATA_DB_BYTES / 1024 / 1024} Mo.
                  </p>
                )}
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
                  autoComplete="off"
                />
                <p className="text-muted-foreground text-xs">
                  Les chemins absolus ne sont jamais exposés dans le rapport.
                </p>
              </div>
            </div>

            <div className="eleven-surface-stone shadow-eleven-warm rounded-2xl border border-(--eleven-border-subtle) p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Dry run</span>
                <span className="bg-background/80 text-eleven-muted rounded-full px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
                  Recommandé
                </span>
              </div>
              <label className="flex cursor-pointer items-start gap-3 text-sm select-none">
                <input
                  name="dryRun"
                  type="checkbox"
                  className="border-input text-primary mt-1 size-4 shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring"
                  defaultChecked
                />
                <span className="text-eleven-secondary leading-snug">
                  Ne crée aucun livre ni fichier : exécute la lecture Calibre et affiche le rapport
                  uniquement.
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm select-none">
                <input
                  name="skipCovers"
                  type="checkbox"
                  className="border-input text-primary size-4 rounded focus-visible:ring-2 focus-visible:ring-ring"
                />
                Ignorer les couvertures
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Limite</span>
                <Input
                  name="limit"
                  type="number"
                  min={1}
                  className="h-9 w-32 rounded-xl"
                  placeholder="Tout"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="submit"
                size="lg"
                variant="blackPill"
                disabled={busy || fileOverLimit}
                className="motion-safe:transition-transform motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Import…
                  </>
                ) : (
                  "Lancer l’import"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card
          key={`${result.stats.imported}-${result.stats.errors}-${result.dryRun}`}
          className="admin-import-result-enter border-(--eleven-border-subtle)"
        >
          <CardHeader className="border-b border-(--eleven-border-subtle)">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Résultat</CardTitle>
                <CardDescription className="mt-1">
                  {result.dryRun ? "Simulation (dry run). " : ""}
                  {summary}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="whitePill"
                  size="sm"
                  disabled={busy}
                  className="motion-safe:transition-transform motion-safe:hover:scale-[1.02]"
                  onClick={() =>
                    downloadText(
                      "calibre-import-report.json",
                      JSON.stringify(result, null, 2),
                      "application/json",
                    )
                  }
                >
                  <FileJson className="size-3.5" aria-hidden />
                  JSON
                </Button>
                <Button
                  type="button"
                  variant="whitePill"
                  size="sm"
                  disabled={busy}
                  className="motion-safe:transition-transform motion-safe:hover:scale-[1.02]"
                  onClick={() =>
                    downloadText("calibre-import-report.csv", resultToCsv(result), "text/csv")
                  }
                >
                  <FileSpreadsheet className="size-3.5" aria-hidden />
                  CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Importés" value={result.stats.imported} delayMs={0} />
              <StatCard label="Ignorés (doublons)" value={result.stats.ignoredDuplicates} delayMs={70} />
              <StatCard label="Erreurs" value={result.stats.errors} delayMs={140} />
              <StatCard label="Entrées DB" value={result.stats.totalInDb} delayMs={210} />
            </div>
            <p className="text-eleven-muted text-xs">
              Traitées pour ce run : {result.stats.considered} livre(s) considéré(s).
            </p>

            {result.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/40">
                <div className="text-amber-900 dark:text-amber-100 mb-2 flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  Avertissements
                </div>
                <ul className="text-eleven-secondary list-inside list-disc space-y-1 text-xs">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div
                role="tablist"
                aria-label="Détail du rapport d’import"
                className="flex flex-wrap gap-1 border-b border-(--eleven-border-subtle) pb-px"
                onKeyDown={onTabListKeyDown}
              >
                {(
                  [
                    { id: "imported" as const, label: "Importés", count: result.imported.length },
                    { id: "ignored" as const, label: "Ignorés", count: result.ignored.length },
                    { id: "errors" as const, label: "Erreurs", count: result.errors.length },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={TAB_IDS[t.id]}
                    aria-selected={activeTab === t.id}
                    aria-controls={PANEL_IDS[t.id]}
                    tabIndex={activeTab === t.id ? 0 : -1}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      "rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
                      activeTab === t.id
                        ? "bg-muted text-foreground"
                        : "text-eleven-muted hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {t.label}
                    <span className="text-eleven-muted ml-1.5 tabular-nums">({t.count})</span>
                  </button>
                ))}
              </div>

              <div
                id={PANEL_IDS.imported}
                role="tabpanel"
                aria-labelledby={TAB_IDS.imported}
                hidden={activeTab !== "imported"}
                className={cn(activeTab === "imported" && "admin-import-tab-panel-enter")}
              >
                {activeTab === "imported" && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-(--eleven-border-subtle)">
                    <div className="max-h-[min(28rem,55vh)] overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/80 supports-[backdrop-filter]:backdrop-blur-sm sticky top-0 z-[1]">
                          <tr>
                            <th className="px-3 py-2.5 font-medium">Calibre ID</th>
                            <th className="px-3 py-2.5 font-medium">Book ID</th>
                            <th className="px-3 py-2.5 font-medium">Titre</th>
                            <th className="px-3 py-2.5 font-medium">Hash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.imported.map((r) => (
                            <tr
                              key={`${r.calibreBookId}-${r.bookId}`}
                              className="border-t border-(--eleven-border-subtle)"
                            >
                              <td className="text-muted-foreground px-3 py-2 tabular-nums">
                                {r.calibreBookId}
                              </td>
                              <td className="font-mono text-xs px-3 py-2">{r.bookId}</td>
                              <td className="px-3 py-2">{r.title}</td>
                              <td className="text-muted-foreground font-mono text-xs px-3 py-2">
                                {r.contentHash.slice(0, 12)}…
                              </td>
                            </tr>
                          ))}
                          {!result.imported.length && (
                            <tr>
                              <td className="text-muted-foreground px-3 py-6 text-center" colSpan={4}>
                                <span className="inline-flex items-center gap-2">
                                  <CheckCircle2 className="size-4 opacity-60" aria-hidden />
                                  Aucun livre importé sur ce run.
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div
                id={PANEL_IDS.ignored}
                role="tabpanel"
                aria-labelledby={TAB_IDS.ignored}
                hidden={activeTab !== "ignored"}
                className={cn(activeTab === "ignored" && "admin-import-tab-panel-enter")}
              >
                {activeTab === "ignored" && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-(--eleven-border-subtle)">
                    <div className="max-h-[min(28rem,55vh)] overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/80 supports-[backdrop-filter]:backdrop-blur-sm sticky top-0 z-[1]">
                          <tr>
                            <th className="px-3 py-2.5 font-medium">Calibre ID</th>
                            <th className="px-3 py-2.5 font-medium">Titre</th>
                            <th className="px-3 py-2.5 font-medium">Raison</th>
                            <th className="px-3 py-2.5 font-medium">Livre existant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.ignored.map((r) => (
                            <tr
                              key={`${r.calibreBookId}-${r.existingBookId}`}
                              className="border-t border-(--eleven-border-subtle)"
                            >
                              <td className="text-muted-foreground px-3 py-2 tabular-nums">
                                {r.calibreBookId}
                              </td>
                              <td className="px-3 py-2">{r.title}</td>
                              <td className="text-muted-foreground px-3 py-2">{r.reason}</td>
                              <td className="font-mono text-xs px-3 py-2">{r.existingBookId}</td>
                            </tr>
                          ))}
                          {!result.ignored.length && (
                            <tr>
                              <td className="text-muted-foreground px-3 py-6 text-center" colSpan={4}>
                                Aucun doublon ignoré.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div
                id={PANEL_IDS.errors}
                role="tabpanel"
                aria-labelledby={TAB_IDS.errors}
                hidden={activeTab !== "errors"}
                className={cn(activeTab === "errors" && "admin-import-tab-panel-enter")}
              >
                {activeTab === "errors" && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-(--eleven-border-subtle)">
                    <div className="max-h-[min(28rem,55vh)] overflow-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-muted/80 supports-[backdrop-filter]:backdrop-blur-sm sticky top-0 z-[1]">
                          <tr>
                            <th className="px-3 py-2.5 font-medium">Calibre ID</th>
                            <th className="px-3 py-2.5 font-medium">Titre</th>
                            <th className="px-3 py-2.5 font-medium">Code</th>
                            <th className="px-3 py-2.5 font-medium">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.errors.map((e) => (
                            <tr
                              key={`${e.calibreBookId}-${e.code}`}
                              className="border-t border-(--eleven-border-subtle)"
                            >
                              <td className="text-muted-foreground px-3 py-2 tabular-nums">
                                {e.calibreBookId}
                              </td>
                              <td className="px-3 py-2">{e.title}</td>
                              <td className="text-muted-foreground px-3 py-2">{e.code}</td>
                              <td className="text-muted-foreground px-3 py-2">{e.message}</td>
                            </tr>
                          ))}
                          {!result.errors.length && (
                            <tr>
                              <td className="text-muted-foreground px-3 py-6 text-center" colSpan={4}>
                                <span className="inline-flex items-center gap-2">
                                  <CheckCircle2 className="size-4 opacity-60" aria-hidden />
                                  Aucune erreur.
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="text-eleven-muted text-xs">
            Rapport généré côté serveur — les chemins absolus ne sont pas inclus dans les exports.
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
