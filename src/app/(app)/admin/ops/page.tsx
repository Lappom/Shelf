import { requireAdminPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getCircuitBreakerSnapshot } from "@/lib/resilience/circuitBreaker";

import { OpsDashboard } from "./ops-dashboard";
import { buildOpsKpis, sortOpsJobRows, type OpsJobRow } from "./ops-model";

export default async function AdminOpsPage() {
  await requireAdminPage();

  const byStatusType = await prisma.adminImportJob.groupBy({
    by: ["status", "type"],
    _count: { _all: true },
  });

  const lastFinishedRaw = await prisma.adminImportJob.groupBy({
    by: ["type"],
    _max: { finishedAt: true },
    where: { finishedAt: { not: null } },
  });

  const circuits = getCircuitBreakerSnapshot();

  const rows: OpsJobRow[] = sortOpsJobRows(
    byStatusType.map((r) => ({
      type: r.type,
      status: r.status,
      count: r._count._all,
    })),
  );

  const kpis = buildOpsKpis(byStatusType.map((r) => ({
    type: r.type,
    status: r.status,
    count: r._count._all,
  })));

  const lastFinished = lastFinishedRaw
    .map((r) => {
      const d = r._max.finishedAt;
      const finishedAtIso = d?.toISOString() ?? null;
      const finishedAtLabelFr =
        d != null
          ? d.toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "medium",
            })
          : "—";
      return {
        type: r.type,
        finishedAtIso,
        finishedAtLabelFr,
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type));

  return <OpsDashboard rows={rows} kpis={kpis} lastFinished={lastFinished} circuits={circuits} />;
}
