"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

type AuditRow = {
  id: string;
  bookId: string;
  actorId: string;
  snapshotSyncedAtIso: string | null;
  writeback: boolean;
  oldContentHash: string | null;
  newContentHash: string | null;
  createdAt: string;
};

export function AdminMetadataMergeAuditsClient() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<{
    before: string;
    beforeId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const load = useCallback(async (cursor: { before: string; beforeId: string } | null) => {
    setError(null);
    const u = new URL("/api/admin/metadata-merge-audits", window.location.origin);
    u.searchParams.set("limit", "40");
    if (cursor) {
      u.searchParams.set("before", cursor.before);
      u.searchParams.set("beforeId", cursor.beforeId);
    }
    const res = await fetch(u.toString()).catch(() => null);
    if (!res?.ok) {
      setError("Chargement impossible");
      return;
    }
    const data = (await res.json()) as {
      audits: AuditRow[];
      nextCursor: { before: string; beforeId: string } | null;
    };
    if (cursor) {
      setRows((prev) => [...prev, ...data.audits]);
    } else {
      setRows(data.audits);
    }
    setNextCursor(data.nextCursor);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => load(null)}>
        Charger / rafraîchir
      </Button>
      <div className="overflow-hidden rounded-2xl border border-(--eleven-border-subtle)">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Livre</th>
              <th className="px-3 py-2 font-medium">Acteur</th>
              <th className="px-3 py-2 font-medium">Writeback</th>
              <th className="px-3 py-2 font-medium">Hash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-(--eleven-border-subtle)">
                <td className="text-muted-foreground px-3 py-2">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Link className="underline" href={`/admin/books/${r.bookId}/metadata-merge`}>
                    {r.bookId.slice(0, 8)}…
                  </Link>
                </td>
                <td className="text-muted-foreground px-3 py-2">{r.actorId.slice(0, 8)}…</td>
                <td className="px-3 py-2">{r.writeback ? "oui" : "non"}</td>
                <td className="text-muted-foreground max-w-[200px] truncate px-3 py-2 text-xs">
                  {r.oldContentHash ?? "—"} → {r.newContentHash ?? "—"}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="text-muted-foreground px-3 py-3" colSpan={5}>
                  Aucune entrée — cliquez sur « Charger ».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => startTransition(() => load(nextCursor))}
        >
          {busy ? "…" : "Charger plus"}
        </Button>
      ) : null}
    </div>
  );
}
