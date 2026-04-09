"use client";

import { Fragment, useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ResyncResult } from "@/lib/books/metadataSync";
import { resyncMetadataAction } from "@/app/(app)/book/[id]/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Re-sync…" : "Re-sync métadonnées"}
    </Button>
  );
}

function formatValue(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "string") return v || "—";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function Badge({
  children,
  variant,
}: {
  children: string;
  variant: "muted" | "epub" | "db" | "conflict";
}) {
  const cls =
    variant === "epub"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : variant === "db"
        ? "border-blue-200 bg-blue-50 text-blue-800"
        : variant === "conflict"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-[var(--eleven-border-subtle)] bg-muted/30 text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      {children}
    </span>
  );
}

export function ResyncMetadataPanel({ bookId }: { bookId: string }) {
  const [state, action] = useActionState<ResyncResult | null, FormData>(resyncMetadataAction, null);

  return (
    <Card size="sm" variant="default">
      <CardHeader className="border-b">
        <CardTitle>Synchronisation métadonnées</CardTitle>
        <CardDescription>
          Three-way merge (EPUB vs DB vs snapshot). En conflit, le fichier gagne. En cas DB
          gagnante, writeback OPF.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="bookId" value={bookId} />
          <SubmitButton />
          {state?.ok && (
            <Badge variant={state.writeback ? "db" : "muted"}>
              {state.writeback ? "Writeback effectué" : "Aucun writeback"}
            </Badge>
          )}
          {state && !state.ok && <Badge variant="conflict">Erreur</Badge>}
        </form>

        {state && !state.ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </div>
        )}

        {state?.ok && (
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs">
              Hash: {state.oldContentHash ?? "—"} → {state.newContentHash ?? "—"}
            </div>
            <div className="overflow-hidden rounded-xl border border-(--eleven-border-subtle)">
              <div className="grid grid-cols-1 gap-px bg-(--eleven-border-subtle) md:grid-cols-[220px_1fr_1fr_1fr_140px]">
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium">Champ</div>
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium">EPUB</div>
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium">DB</div>
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium">Snapshot</div>
                <div className="bg-muted/40 px-3 py-2 text-xs font-medium">Décision</div>

                {state.fields.map((f) => {
                  const decisionLabel =
                    f.decision === "take_epub"
                      ? "EPUB"
                      : f.decision === "take_db"
                        ? "DB"
                        : f.decision === "conflict_take_epub"
                          ? "Conflit → EPUB"
                          : "—";

                  const badgeVariant =
                    f.decision === "take_epub"
                      ? "epub"
                      : f.decision === "take_db"
                        ? "db"
                        : f.decision === "conflict_take_epub"
                          ? "conflict"
                          : "muted";

                  return (
                    <Fragment key={String(f.field)}>
                      <div className="bg-background px-3 py-2 text-xs font-medium">
                        {String(f.field)}
                      </div>
                      <div className="bg-background text-muted-foreground px-3 py-2 text-xs">
                        {formatValue(f.epubValue)}
                      </div>
                      <div className="bg-background text-muted-foreground px-3 py-2 text-xs">
                        {formatValue(f.dbValue)}
                      </div>
                      <div className="bg-background text-muted-foreground px-3 py-2 text-xs">
                        {formatValue(f.snapValue)}
                      </div>
                      <div className="bg-background px-3 py-2 text-xs">
                        <Badge variant={badgeVariant}>{decisionLabel}</Badge>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end">
        <div className="text-muted-foreground text-xs">
          Le fichier EPUB n’est jamais servi directement (lecture via endpoint authentifié).
        </div>
      </CardFooter>
    </Card>
  );
}
