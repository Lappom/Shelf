import Link from "next/link";
import type { CSSProperties } from "react";

import type { AdminImportJobType } from "@prisma/client";
import type { CircuitState } from "@/lib/resilience/circuitBreaker";
import { Button } from "@/components/ui/button";

import {
  OPS_STATUS_LABEL_FR,
  OPS_TYPE_LABEL_FR,
  type OpsJobRow,
  type OpsKpis,
} from "./ops-model";
import { OpsRefreshButton } from "./ops-refresh-button";
import { OpsRelativeFinished } from "./ops-relative-finished";

export type OpsLastFinishedRow = {
  type: AdminImportJobType;
  finishedAtIso: string | null;
  /** Pre-formatted for title attribute and SSR fallback */
  finishedAtLabelFr: string;
};

export type OpsDashboardProps = {
  rows: OpsJobRow[];
  kpis: OpsKpis;
  lastFinished: OpsLastFinishedRow[];
  circuits: Record<string, CircuitState>;
};

const CIRCUIT_LABEL_FR: Record<CircuitState, string> = {
  closed: "Fermé",
  open: "Ouvert",
  half_open: "Semi-ouvert",
};

function statusPillClass(status: OpsJobRow["status"]): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] font-medium tracking-wide motion-reduce:transition-none";
  switch (status) {
    case "running":
      return `${base} border-primary/25 bg-primary/10 text-foreground`;
    case "queued":
      return `${base} border-(--eleven-border-subtle) bg-muted/60 text-foreground`;
    case "succeeded":
      return `${base} border-(--eleven-border-subtle) bg-muted/40 text-eleven-secondary`;
    case "failed":
    case "dead_letter":
      return `${base} border-destructive/25 bg-destructive/10 text-destructive`;
    case "cancelled":
      return `${base} border-(--eleven-border-subtle) bg-muted/30 text-eleven-muted`;
    default:
      return `${base} border-(--eleven-border-subtle) bg-muted/50 text-foreground`;
  }
}

function circuitPillClass(state: CircuitState): string {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-wide";
  switch (state) {
    case "open":
      return `${base} border-destructive/30 bg-destructive/10 text-destructive`;
    case "half_open":
      return `${base} border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200`;
    case "closed":
      return `${base} border-(--eleven-border-subtle) bg-muted/50 text-eleven-muted`;
    default:
      return `${base} border-(--eleven-border-subtle) bg-muted/50 text-foreground`;
  }
}

function KpiCard({
  label,
  value,
  sub,
  delayMs,
  className,
}: {
  label: string;
  value: number;
  sub?: string;
  delayMs: number;
  className?: string;
}) {
  return (
    <div
      className={`admin-ops-kpi-enter rounded-2xl border border-(--eleven-border-subtle) bg-card p-4 shadow-eleven-card transition-[box-shadow,transform] duration-200 motion-reduce:transition-none hover:-translate-y-px hover:shadow-eleven-button-white motion-reduce:hover:translate-y-0 motion-reduce:hover:shadow-eleven-card ${className ?? ""}`}
      style={{ "--admin-ops-kpi-delay": `${delayMs}ms` } as CSSProperties}
    >
      <p className="text-eleven-muted text-[13px] font-medium tracking-wide">{label}</p>
      <p className="eleven-display-section mt-1 text-3xl font-light tabular-nums text-foreground">{value}</p>
      {sub ? <p className="text-eleven-muted eleven-body-airy mt-1 text-xs tracking-wide">{sub}</p> : null}
    </div>
  );
}

export function OpsDashboard({ rows, kpis, lastFinished, circuits }: OpsDashboardProps) {
  const circuitEntries = Object.entries(circuits).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-8">
      <div className="admin-ops-hero-enter flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 className="eleven-display-section text-2xl text-foreground sm:text-3xl">Ops — synthèse</h2>
          <p className="text-eleven-muted eleven-body-airy max-w-2xl text-sm tracking-wide">
            Compteurs des jobs d’import admin et état local des circuit breakers (un seul processus ; voir{" "}
            <code className="rounded-md bg-muted/80 px-1 py-0.5 font-mono text-[12px]">/api/admin/ops-summary</code>
            ).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OpsRefreshButton />
        </div>
      </div>

      <div className="admin-ops-actions-enter flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="rounded-eleven-pill">
          <Link href="/admin/pull-books">Pull Open Library</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-eleven-pill">
          <Link href="/api/admin/audit-logs">Audit (API)</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-eleven-pill">
          <Link href="/api/admin/ops-summary">Ops summary (JSON)</Link>
        </Button>
      </div>

      <div className="admin-ops-panel-enter space-y-3">
        <h3 className="text-eleven-muted text-[13px] font-medium tracking-wide uppercase">Vue d’ensemble</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard label="Total jobs" value={kpis.total} delayMs={0} />
          <KpiCard label="En cours" value={kpis.running} delayMs={45} />
          <KpiCard label="En file" value={kpis.queued} delayMs={90} />
          <KpiCard label="Échoués" value={kpis.failed} delayMs={135} />
          <KpiCard
            label="Dead letter"
            value={kpis.deadLetter}
            delayMs={180}
            className="col-span-2 md:col-span-1 xl:col-span-1"
          />
        </div>
        <div
          className="admin-ops-kpi-enter flex flex-wrap gap-4 rounded-2xl border border-dashed border-(--eleven-border-subtle) bg-muted/15 px-4 py-3"
          style={{ "--admin-ops-kpi-delay": "220ms" } as CSSProperties}
        >
          <span className="text-eleven-muted text-[13px] font-medium tracking-wide">Par type</span>
          <span className="eleven-body-airy text-sm tracking-wide">
            <span className="font-mono text-xs">{OPS_TYPE_LABEL_FR.pull_books}</span>
            <span className="text-eleven-muted mx-1.5">·</span>
            <span className="tabular-nums font-medium">{kpis.byType.pull_books}</span>
          </span>
          <span className="eleven-body-airy text-sm tracking-wide">
            <span className="font-mono text-xs">{OPS_TYPE_LABEL_FR.recommendations_recompute}</span>
            <span className="text-eleven-muted mx-1.5">·</span>
            <span className="tabular-nums font-medium">{kpis.byType.recommendations_recompute}</span>
          </span>
        </div>
      </div>

      <div className="admin-ops-table-panel-enter overflow-hidden rounded-2xl border border-(--eleven-border-subtle) shadow-eleven-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead className="bg-muted/80 supports-backdrop-filter:backdrop-blur-sm sticky top-0 z-10 border-b border-(--eleven-border-subtle)">
              <tr>
                <th className="text-eleven-muted px-4 py-3 text-left text-[13px] font-medium tracking-wide">
                  Type
                </th>
                <th className="text-eleven-muted px-4 py-3 text-left text-[13px] font-medium tracking-wide">
                  Statut
                </th>
                <th className="text-eleven-muted px-4 py-3 text-right text-[13px] font-medium tracking-wide">
                  Nombre
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="text-eleven-muted eleven-body-airy px-4 py-10 text-center" colSpan={3}>
                    Aucun job en base.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={`${r.type}-${r.status}`}
                    className="admin-ops-row-enter border-t border-(--eleven-border-subtle) transition-colors duration-200 motion-reduce:transition-none hover:bg-muted/30"
                    style={{ "--admin-ops-delay": `${i * 42}ms` } as React.CSSProperties}
                  >
                    <td className="px-4 py-3 align-middle">
                      <span className="font-mono text-xs tracking-wide">{r.type}</span>
                      <span className="text-eleven-muted eleven-body-airy ml-2 hidden text-xs sm:inline">
                        ({OPS_TYPE_LABEL_FR[r.type]})
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <span className={statusPillClass(r.status)}>{OPS_STATUS_LABEL_FR[r.status]}</span>
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums font-medium">{r.count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-ops-secondary-enter grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-(--eleven-border-subtle) bg-card p-5 shadow-eleven-card sm:p-6">
          <h3 className="eleven-display-section text-lg font-light text-foreground">Dernier job terminé par type</h3>
          <p className="text-eleven-muted eleven-body-airy mt-1 text-xs tracking-wide">
            Horodatage relatif (fuseau navigateur) ; survol pour la date complète.
          </p>
          <ul className="mt-4 space-y-3">
            {lastFinished.length === 0 ? (
              <li className="text-eleven-muted eleven-body-airy text-sm">Aucun.</li>
            ) : (
              lastFinished.map((r) => (
                <li
                  key={r.type}
                  className="flex flex-col gap-1 rounded-xl border border-(--eleven-border-subtle) bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-mono text-xs tracking-wide text-foreground">{r.type}</span>
                  {r.finishedAtIso ? (
                    <OpsRelativeFinished iso={r.finishedAtIso} title={r.finishedAtLabelFr} />
                  ) : (
                    <span className="text-eleven-muted text-sm">—</span>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-(--eleven-border-subtle) bg-card p-5 shadow-eleven-card sm:p-6">
          <h3 className="eleven-display-section text-lg font-light text-foreground">
            Circuit breakers (processus local)
          </h3>
          <p className="text-eleven-muted eleven-body-airy mt-1 text-xs tracking-wide">
            État en mémoire uniquement — normal vide après cold start.
          </p>
          <ul className="mt-4 space-y-2">
            {circuitEntries.length === 0 ? (
              <li className="text-eleven-muted eleven-body-airy text-sm">Aucun état en mémoire (normal au cold start).</li>
            ) : (
              circuitEntries.map(([name, state]) => (
                <li
                  key={name}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--eleven-border-subtle) bg-muted/15 px-4 py-2.5"
                >
                  <span className="font-mono text-xs tracking-wide text-foreground">{name}</span>
                  <span className={circuitPillClass(state)}>{CIRCUIT_LABEL_FR[state]}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
