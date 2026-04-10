"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BusinessConflictCode =
  | "isbn_mismatch"
  | "invalid_language"
  | "missing_title_with_identifier"
  | "ambiguous_publish_date";

type FieldRow = {
  field: string;
  mergeWithEpub: boolean;
  epubNormalized: unknown;
  dbNormalized: unknown;
  snapNormalized: unknown;
  automaticDecision: string;
  technicalConflict: boolean;
  businessConflicts: BusinessConflictCode[];
  confidence: number;
};

type DecisionMode = "use_source" | "use_db" | "use_snapshot" | "manual";

type LocalDecision = {
  mode: DecisionMode;
  manualText: string;
};

function formatVal(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join("; ") : "—";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function manualToValue(field: string, text: string): unknown {
  if (field === "authors" || field === "subjects") {
    return text
      .split(/[;,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (field === "pageCount") {
    const t = text.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  if (
    field === "title" ||
    field === "language" ||
    field === "description" ||
    field === "isbn10" ||
    field === "isbn13" ||
    field === "publisher" ||
    field === "publishDate" ||
    field === "openLibraryId"
  ) {
    const t = text.trim();
    return t.length ? t : null;
  }
  return text;
}

function valueToManualText(field: string, v: unknown): string {
  if (v == null) return "";
  if (field === "authors" || field === "subjects") {
    return Array.isArray(v) ? (v as string[]).join("; ") : String(v);
  }
  return typeof v === "string" ? v : JSON.stringify(v);
}

function buildPayload(decisions: Record<string, LocalDecision>) {
  return Object.entries(decisions).map(([field, d]) => {
    if (d.mode === "manual") {
      return { field, mode: "manual", manual: manualToValue(field, d.manualText) };
    }
    return { field, mode: d.mode };
  });
}

export function AdminMetadataMergeClient({ bookId }: { bookId: string }) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  /** Snapshot `syncedAt` to send on commit (updated after load + successful preview). */
  const [commitSnapshotIso, setCommitSnapshotIso] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, LocalDecision>>({});
  const [preview, setPreview] = useState<{
    merged: unknown;
    writeback: boolean;
    snapshotAt: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetch(`/api/admin/books/${bookId}/metadata-merge`).catch(() => null);
    if (!res?.ok) {
      const j = (await res?.json().catch(() => null)) as { error?: string } | null;
      setLoadError(j?.error ?? "Chargement impossible");
      setFields([]);
      return;
    }
    const data = (await res.json()) as {
      fields: FieldRow[];
      suggestedDecisions: { field: string; mode: DecisionMode }[];
      snapshotSyncedAt: string;
    };
    setFields(data.fields);
    setCommitSnapshotIso(data.snapshotSyncedAt);
    const next: Record<string, LocalDecision> = {};
    for (const s of data.suggestedDecisions) {
      const fr = data.fields.find((f) => f.field === s.field);
      const baseVal =
        s.mode === "use_source"
          ? fr?.epubNormalized
          : s.mode === "use_snapshot"
            ? fr?.snapNormalized
            : fr?.dbNormalized;
      next[s.field] = {
        mode: s.mode,
        manualText: valueToManualText(s.field, baseVal),
      };
    }
    setDecisions(next);
    setPreview(null);
  }, [bookId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const decisionList = useMemo(() => buildPayload(decisions), [decisions]);

  function setMode(field: string, mode: DecisionMode) {
    setDecisions((prev) => {
      const fr = fields.find((f) => f.field === field);
      const baseVal =
        mode === "use_source"
          ? fr?.epubNormalized
          : mode === "use_snapshot"
            ? fr?.snapNormalized
            : fr?.dbNormalized;
      return {
        ...prev,
        [field]: {
          mode,
          manualText:
            mode === "manual" ? (prev[field]?.manualText ?? "") : valueToManualText(field, baseVal),
        },
      };
    });
    setPreview(null);
  }

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/books/${bookId}/metadata-merge/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decisions: decisionList }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = (await res?.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Preview échoué");
        setPreview(null);
        return;
      }
      const data = (await res.json()) as {
        merged: unknown;
        writeback: boolean;
        snapshotSyncedAt: string;
      };
      setCommitSnapshotIso(data.snapshotSyncedAt);
      setPreview({
        merged: data.merged,
        writeback: data.writeback,
        snapshotAt: data.snapshotSyncedAt,
      });
    });
  }

  function runCommit() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/books/${bookId}/metadata-merge/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decisions: decisionList,
          expectedSnapshotSyncedAtIso: commitSnapshotIso ?? undefined,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        const j = (await res?.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Commit échoué");
        return;
      }
      setPreview(null);
      await load();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/books">← Livres</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/book/${bookId}`}>Fiche livre</Link>
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void load()}>
          Recharger
        </Button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {fields.length > 0 && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Champs</CardTitle>
            <CardDescription>
              Source = fichier EPUB normalisé. Actions rapides par ligne. Snapshot = dernière sync
              en base.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-2 font-medium">Champ</th>
                    <th className="px-2 py-2 font-medium">Source</th>
                    <th className="px-2 py-2 font-medium">DB</th>
                    <th className="px-2 py-2 font-medium">Snapshot</th>
                    <th className="px-2 py-2 font-medium">Confiance</th>
                    <th className="px-2 py-2 font-medium">Alertes</th>
                    <th className="px-2 py-2 font-medium">Décision</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => {
                    const d = decisions[f.field] ?? { mode: "use_db" as const, manualText: "" };
                    return (
                      <tr key={f.field} className="border-t border-(--eleven-border-subtle)">
                        <td className="px-2 py-2 font-medium">{f.field}</td>
                        <td className="text-muted-foreground max-w-[180px] px-2 py-2 wrap-break-word">
                          {formatVal(f.epubNormalized)}
                        </td>
                        <td className="text-muted-foreground max-w-[180px] px-2 py-2 wrap-break-word">
                          {formatVal(f.dbNormalized)}
                        </td>
                        <td className="text-muted-foreground max-w-[180px] px-2 py-2 wrap-break-word">
                          {formatVal(f.snapNormalized)}
                        </td>
                        <td className="px-2 py-2">{f.confidence.toFixed(2)}</td>
                        <td className="px-2 py-2">
                          {f.technicalConflict ? (
                            <span className="text-amber-800">conflit technique </span>
                          ) : null}
                          {f.businessConflicts.join(", ") || "—"}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant={d.mode === "use_source" ? "default" : "outline"}
                                disabled={busy || !f.mergeWithEpub}
                                onClick={() => setMode(f.field, "use_source")}
                              >
                                Source
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={d.mode === "use_db" ? "default" : "outline"}
                                disabled={busy}
                                onClick={() => setMode(f.field, "use_db")}
                              >
                                DB
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={d.mode === "use_snapshot" ? "default" : "outline"}
                                disabled={busy}
                                onClick={() => setMode(f.field, "use_snapshot")}
                              >
                                Snapshot
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={d.mode === "manual" ? "default" : "outline"}
                                disabled={busy}
                                onClick={() => setMode(f.field, "manual")}
                              >
                                Manuel
                              </Button>
                            </div>
                            {d.mode === "manual" && (
                              <Input
                                value={d.manualText}
                                onChange={(e) => {
                                  setDecisions((prev) => ({
                                    ...prev,
                                    [f.field]: { mode: "manual", manualText: e.target.value },
                                  }));
                                  setPreview(null);
                                }}
                                placeholder={
                                  f.field === "authors" || f.field === "subjects"
                                    ? "valeurs séparées par ;"
                                    : "valeur"
                                }
                                className="text-xs"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={runPreview}>
                Prévisualiser
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={busy || !preview}
                onClick={runCommit}
              >
                Valider (commit)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Prévisualisation</CardTitle>
            <CardDescription>
              Writeback OPF : {preview.writeback ? "oui" : "non"} — snapshot attendu :{" "}
              {preview.snapshotAt}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="bg-muted/40 max-h-[420px] overflow-auto rounded-lg p-3 text-xs">
              {JSON.stringify(preview.merged, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
