import Link from "next/link";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getCircuitBreakerSnapshot } from "@/lib/resilience/circuitBreaker";
import { Button } from "@/components/ui/button";

export default async function AdminOpsPage() {
  await requireAdmin();

  const byStatusType = await prisma.adminImportJob.groupBy({
    by: ["status", "type"],
    _count: { _all: true },
  });

  const lastFinished = await prisma.adminImportJob.groupBy({
    by: ["type"],
    _max: { finishedAt: true },
    where: { finishedAt: { not: null } },
  });

  const circuits = getCircuitBreakerSnapshot();

  const rows = byStatusType.map((r) => ({
    type: r.type,
    status: r.status,
    count: r._count._all,
  }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">Ops — synthèse</h2>
        <p className="text-muted-foreground text-sm">
          Compteurs de jobs d’import admin et état local des circuit breakers (voir note API).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="rounded-eleven-pill">
          <Link href="/admin/pull-books">Pull Open Library</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-eleven-pill">
          <Link href="/api/admin/audit-logs">Audit (API)</Link>
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2 text-right">Nombre</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-muted-foreground" colSpan={3}>
                  Aucun job en base.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.type}-${r.status}`} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{r.type}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.status}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Dernier job terminé par type</h3>
        <ul className="text-muted-foreground space-y-1 text-sm">
          {lastFinished.length === 0 ? (
            <li>Aucun.</li>
          ) : (
            lastFinished.map((r) => (
              <li key={r.type}>
                <span className="font-mono text-xs">{r.type}</span> —{" "}
                {r._max.finishedAt?.toISOString() ?? "—"}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Circuit breakers (processus local)</h3>
        <ul className="text-muted-foreground space-y-1 font-mono text-xs">
          {Object.keys(circuits).length === 0 ? (
            <li>Aucun état en mémoire (normal au cold start).</li>
          ) : (
            Object.entries(circuits).map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
