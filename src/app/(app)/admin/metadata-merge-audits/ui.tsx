"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

const STAGGER_CAP = 14;
const STAGGER_MS = 35;
const SKELETON_ROWS = 7;
const UUID_SCHEMA = z.string().uuid();

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function rowEnterStyle(index: number): React.CSSProperties {
  return {
    ["--admin-merge-audits-delay" as string]: `${Math.min(index, STAGGER_CAP) * STAGGER_MS}ms`,
  } as React.CSSProperties;
}

function skeletonRowStyle(index: number): React.CSSProperties {
  return {
    ["--admin-merge-audits-skeleton-delay" as string]: `${Math.min(index, 10) * 55}ms`,
  } as React.CSSProperties;
}

function hashLine(r: AuditRow) {
  const a = r.oldContentHash ?? "—";
  const b = r.newContentHash ?? "—";
  return `${a} → ${b}`;
}

export function AdminMetadataMergeAuditsClient() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [nextCursor, setNextCursor] = useState<{
    before: string;
    beforeId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterFieldError, setFilterFieldError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [appliedBookId, setAppliedBookId] = useState<string | null>(null);
  const [bookIdInput, setBookIdInput] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingMore, startTransition] = useTransition();

  const flashCopied = useCallback((key: string) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedKey(key);
    copyTimerRef.current = setTimeout(() => {
      setCopiedKey(null);
      copyTimerRef.current = null;
    }, 2000);
  }, []);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const loadReplace = useCallback(async (bookId: string | null) => {
    setReplacing(true);
    setError(null);
    const u = new URL("/api/admin/metadata-merge-audits", window.location.origin);
    u.searchParams.set("limit", "40");
    if (bookId) u.searchParams.set("bookId", bookId);
    const res = await fetch(u.toString()).catch(() => null);
    if (!res?.ok) {
      setError(
        res?.status === 400
          ? "Requête invalide — vérifiez l’UUID du livre."
          : "Chargement impossible.",
      );
      setRows([]);
      setNextCursor(null);
      setReplacing(false);
      return;
    }
    const data = (await res.json()) as {
      audits: AuditRow[];
      nextCursor: { before: string; beforeId: string } | null;
    };
    setRows(data.audits);
    setNextCursor(data.nextCursor);
    setReplacing(false);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadReplace(appliedBookId);
    }, 0);
    return () => window.clearTimeout(id);
  }, [appliedBookId, loadReplace]);

  const loadAppend = useCallback(async () => {
    if (!nextCursor) return;
    const cursor = nextCursor;
    setError(null);
    const u = new URL("/api/admin/metadata-merge-audits", window.location.origin);
    u.searchParams.set("limit", "40");
    u.searchParams.set("before", cursor.before);
    u.searchParams.set("beforeId", cursor.beforeId);
    if (appliedBookId) u.searchParams.set("bookId", appliedBookId);
    const res = await fetch(u.toString()).catch(() => null);
    if (!res?.ok) {
      setError("Chargement impossible.");
      return;
    }
    const data = (await res.json()) as {
      audits: AuditRow[];
      nextCursor: { before: string; beforeId: string } | null;
    };
    setRows((prev) => [...prev, ...data.audits]);
    setNextCursor(data.nextCursor);
  }, [nextCursor, appliedBookId]);

  const onApplyFilter = () => {
    setFilterFieldError(null);
    const raw = bookIdInput.trim();
    if (!raw) {
      setAppliedBookId(null);
      return;
    }
    const parsed = UUID_SCHEMA.safeParse(raw);
    if (!parsed.success) {
      setFilterFieldError("UUID invalide.");
      return;
    }
    setAppliedBookId(parsed.data);
    setBookIdInput(parsed.data);
  };

  const onResetFilter = () => {
    setFilterFieldError(null);
    setBookIdInput("");
    setAppliedBookId(null);
  };

  const showSkeleton = replacing && rows.length === 0;
  const showEmptyRow = !replacing && rows.length === 0;
  const emptyMessage = appliedBookId
    ? "Aucun audit pour ce livre."
    : "Aucun audit enregistré pour le moment.";

  return (
    <div className="space-y-4">
      {error ? (
        <div
          className="bg-destructive/5 text-destructive shadow-eleven-card rounded-2xl border border-(--eleven-border-subtle) px-4 py-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div
        className="admin-merge-audits-toolbar-enter bg-card/80 shadow-eleven-card flex flex-col gap-3 rounded-2xl border border-(--eleven-border-subtle) p-4 sm:flex-row sm:flex-wrap sm:items-end"
        aria-busy={replacing}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-md">
          <label
            className="text-eleven-muted text-xs font-medium tracking-wide uppercase"
            htmlFor="merge-audit-book-filter"
          >
            Filtrer par ID livre
          </label>
          <Input
            id="merge-audit-book-filter"
            className="shadow-eleven-button-white rounded-xl font-mono text-sm transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-[rgb(147_197_253_/_0.5)] motion-reduce:transition-none"
            placeholder="UUID (optionnel)"
            value={bookIdInput}
            onChange={(e) => {
              setFilterFieldError(null);
              setBookIdInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onApplyFilter();
            }}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={filterFieldError ? true : undefined}
            aria-describedby={filterFieldError ? "merge-audit-filter-error" : undefined}
          />
          {filterFieldError ? (
            <p id="merge-audit-filter-error" className="text-destructive text-xs">
              {filterFieldError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="rounded-eleven-pill shadow-eleven-button-white transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
            disabled={replacing}
            onClick={onApplyFilter}
          >
            Appliquer
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-eleven-pill shadow-eleven-button-white transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
            disabled={replacing || (!bookIdInput.trim() && appliedBookId === null)}
            onClick={onResetFilter}
          >
            Réinitialiser
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-eleven-pill shadow-eleven-button-white inline-flex items-center gap-2 transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
            disabled={replacing}
            aria-label="Rafraîchir la liste"
            onClick={() => void loadReplace(appliedBookId)}
          >
            {replacing ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4 shrink-0" aria-hidden />
            )}
            <span className="hidden sm:inline">Rafraîchir</span>
          </Button>
        </div>
        {replacing && rows.length > 0 ? (
          <p className="text-eleven-muted w-full text-xs">Actualisation…</p>
        ) : null}
      </div>

      <div
        className={cn(
          "admin-merge-audits-panel-enter shadow-eleven-card overflow-x-auto rounded-2xl border border-(--eleven-border-subtle) transition-opacity duration-200 motion-reduce:transition-none",
          replacing && rows.length > 0 && "opacity-70",
        )}
      >
        <table className="text-eleven-secondary eleven-body-airy w-full min-w-[880px] text-left text-sm">
          <thead className="bg-muted/35 border-b border-(--eleven-border-subtle)">
            <tr>
              <th className="text-foreground px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Date
              </th>
              <th className="text-foreground px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Livre
              </th>
              <th className="text-foreground px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Acteur
              </th>
              <th className="text-foreground px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Snapshot sync
              </th>
              <th className="text-foreground px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Writeback
              </th>
              <th className="text-foreground px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Hash
              </th>
              <th className="text-foreground w-28 px-3 py-2.5 text-xs font-medium tracking-wide uppercase">
                Copier
              </th>
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={`sk-${i}`} className="border-t border-(--eleven-border-subtle)">
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div
                          className="admin-merge-audits-skeleton-stagger bg-muted/80 h-3 rounded-md"
                          style={skeletonRowStyle(i + j)}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {!showSkeleton &&
              rows.map((r, index) => (
                <tr
                  key={r.id}
                  className="admin-merge-audits-row-enter hover:bg-muted/25 border-t border-(--eleven-border-subtle) transition-colors duration-150 motion-reduce:transition-none"
                  style={rowEnterStyle(index)}
                >
                  <td className="text-eleven-muted px-3 py-2.5 whitespace-nowrap tabular-nums">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Link
                        className="text-foreground font-mono text-xs underline-offset-2 transition-colors hover:underline"
                        href={`/admin/books/${r.bookId}/metadata-merge`}
                      >
                        {r.bookId.slice(0, 8)}…
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-eleven-pill h-7 w-7 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                        aria-label="Copier l’ID du livre"
                        onClick={() => {
                          void navigator.clipboard.writeText(r.bookId);
                          flashCopied(`${r.id}-book`);
                        }}
                      >
                        {copiedKey === `${r.id}-book` ? (
                          <Check
                            className="size-3.5 text-emerald-600 dark:text-emerald-400"
                            aria-hidden
                          />
                        ) : (
                          <Copy className="size-3.5 opacity-70" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-eleven-muted font-mono text-xs">
                        {r.actorId.slice(0, 8)}…
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-eleven-pill h-7 w-7 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                        aria-label="Copier l’ID acteur"
                        onClick={() => {
                          void navigator.clipboard.writeText(r.actorId);
                          flashCopied(`${r.id}-actor`);
                        }}
                      >
                        {copiedKey === `${r.id}-actor` ? (
                          <Check
                            className="size-3.5 text-emerald-600 dark:text-emerald-400"
                            aria-hidden
                          />
                        ) : (
                          <Copy className="size-3.5 opacity-70" aria-hidden />
                        )}
                      </Button>
                    </div>
                  </td>
                  <td className="text-eleven-muted px-3 py-2.5 text-xs whitespace-nowrap tabular-nums">
                    {formatWhen(r.snapshotSyncedAtIso)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "rounded-eleven-pill inline-flex border px-2.5 py-0.5 text-xs font-medium tracking-wide",
                        r.writeback
                          ? "border-foreground/15 bg-foreground/8 text-foreground"
                          : "bg-muted/50 text-eleven-muted border-(--eleven-border-subtle)",
                      )}
                    >
                      {r.writeback ? "Oui" : "Non"}
                    </span>
                  </td>
                  <td className="text-eleven-muted max-w-[220px] px-3 py-2.5 font-mono text-[11px] leading-relaxed">
                    <span className="line-clamp-2 break-all" title={hashLine(r)}>
                      {hashLine(r)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-eleven-pill shadow-eleven-button-white h-8 gap-1 px-2 text-xs transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                      onClick={() => {
                        void navigator.clipboard.writeText(hashLine(r));
                        flashCopied(`${r.id}-hash`);
                      }}
                    >
                      {copiedKey === `${r.id}-hash` ? (
                        <>
                          <Check
                            className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-hidden
                          />
                          Copié
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5 shrink-0 opacity-70" aria-hidden />
                          Hashes
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            {showEmptyRow ? (
              <tr>
                <td className="text-eleven-muted px-3 py-8 text-center text-sm" colSpan={7}>
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {nextCursor ? (
        <Button
          type="button"
          variant="outline"
          className="rounded-eleven-pill shadow-eleven-button-white transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:scale-[1.02] active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
          disabled={pendingMore || replacing}
          onClick={() => startTransition(() => void loadAppend())}
        >
          {pendingMore ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Chargement…
            </>
          ) : (
            "Charger plus"
          )}
        </Button>
      ) : null}
    </div>
  );
}
