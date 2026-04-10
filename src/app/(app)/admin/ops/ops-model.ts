import type { AdminImportJobStatus, AdminImportJobType } from "@prisma/client";

export type OpsJobRow = {
  type: AdminImportJobType;
  status: AdminImportJobStatus;
  count: number;
};

export type OpsKpis = {
  total: number;
  running: number;
  queued: number;
  failed: number;
  deadLetter: number;
  byType: Record<AdminImportJobType, number>;
};

const STATUS_ORDER: Record<AdminImportJobStatus, number> = {
  running: 0,
  queued: 1,
  succeeded: 2,
  failed: 3,
  cancelled: 4,
  dead_letter: 5,
};

const TYPE_ORDER: Record<AdminImportJobType, number> = {
  pull_books: 0,
  recommendations_recompute: 1,
};

export function sortOpsJobRows(rows: OpsJobRow[]): OpsJobRow[] {
  return [...rows].sort((a, b) => {
    const ta = TYPE_ORDER[a.type] ?? 99;
    const tb = TYPE_ORDER[b.type] ?? 99;
    if (ta !== tb) return ta - tb;
    const sa = STATUS_ORDER[a.status] ?? 99;
    const sb = STATUS_ORDER[b.status] ?? 99;
    return sa - sb;
  });
}

export function buildOpsKpis(rows: OpsJobRow[]): OpsKpis {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const sumStatus = (status: AdminImportJobStatus) =>
    rows.filter((r) => r.status === status).reduce((s, r) => s + r.count, 0);

  const byType: Record<AdminImportJobType, number> = {
    pull_books: 0,
    recommendations_recompute: 0,
  };
  for (const r of rows) {
    byType[r.type] = (byType[r.type] ?? 0) + r.count;
  }

  return {
    total,
    running: sumStatus("running"),
    queued: sumStatus("queued"),
    failed: sumStatus("failed"),
    deadLetter: sumStatus("dead_letter"),
    byType,
  };
}

export const OPS_STATUS_LABEL_FR: Record<AdminImportJobStatus, string> = {
  queued: "En file",
  running: "En cours",
  succeeded: "Réussi",
  failed: "Échoué",
  cancelled: "Annulé",
  dead_letter: "Dead letter",
};

export const OPS_TYPE_LABEL_FR: Record<AdminImportJobType, string> = {
  pull_books: "Pull Open Library",
  recommendations_recompute: "Reco (recompute)",
};
