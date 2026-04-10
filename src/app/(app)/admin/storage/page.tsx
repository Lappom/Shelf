import { requireAdminPage } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";

import { StorageDashboard, type StorageMimeBreakdownRow } from "./storage-dashboard";

const MIME_BREAKDOWN_TOP = 5;

function formatBytes(n: bigint | number) {
  const v = typeof n === "bigint" ? Number(n) : n;
  if (!Number.isFinite(v) || v < 0) return "—";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let x = v;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x < 10 && i > 0 ? x.toFixed(1) : Math.round(x)} ${units[i]}`;
}

function buildMimeBreakdown(
  rows: { mimeType: string; bytes: bigint; fileCount: number }[],
  totalBytes: bigint,
): StorageMimeBreakdownRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.bytes < b.bytes) return 1;
    if (a.bytes > b.bytes) return -1;
    return a.mimeType.localeCompare(b.mimeType);
  });

  if (sorted.length <= MIME_BREAKDOWN_TOP) {
    return sorted.map((r) => ({
      label: r.mimeType,
      fileCount: r.fileCount,
      bytesLabel: formatBytes(r.bytes),
      percentOfVolume:
        totalBytes > BigInt(0) ? Math.round((Number(r.bytes) / Number(totalBytes)) * 1000) / 10 : 0,
    }));
  }

  const top = sorted.slice(0, MIME_BREAKDOWN_TOP - 1);
  const rest = sorted.slice(MIME_BREAKDOWN_TOP - 1);
  const otherBytes = rest.reduce((acc, r) => acc + r.bytes, BigInt(0));
  const otherCount = rest.reduce((acc, r) => acc + r.fileCount, 0);

  const mappedTop = top.map((r) => ({
    label: r.mimeType,
    fileCount: r.fileCount,
    bytesLabel: formatBytes(r.bytes),
    percentOfVolume:
      totalBytes > BigInt(0) ? Math.round((Number(r.bytes) / Number(totalBytes)) * 1000) / 10 : 0,
  }));

  const otherRow: StorageMimeBreakdownRow = {
    label: "Autres",
    fileCount: otherCount,
    bytesLabel: formatBytes(otherBytes),
    percentOfVolume:
      totalBytes > BigInt(0)
        ? Math.round((Number(otherBytes) / Number(totalBytes)) * 1000) / 10
        : 0,
  };

  return [...mappedTop, otherRow];
}

export default async function AdminStoragePage() {
  await requireAdminPage();

  const [fileAgg, bookCount, booksWithFilesCount, byMime] = await Promise.all([
    prisma.bookFile.aggregate({
      _sum: { fileSize: true },
      _count: { id: true },
    }),
    prisma.book.count({ where: { deletedAt: null } }),
    prisma.book.count({
      where: { deletedAt: null, files: { some: {} } },
    }),
    prisma.bookFile.groupBy({
      by: ["mimeType"],
      _sum: { fileSize: true },
      _count: { id: true },
    }),
  ]);

  const totalBytes = fileAgg._sum.fileSize ?? BigInt(0);
  const fileCount = fileAgg._count.id;

  const mimeRows = byMime.map((r) => ({
    mimeType: r.mimeType,
    bytes: r._sum.fileSize ?? BigInt(0),
    fileCount: r._count.id,
  }));

  const mimeBreakdown = buildMimeBreakdown(mimeRows, totalBytes);

  const avgBytes = fileCount > 0 ? totalBytes / BigInt(fileCount) : BigInt(0);
  const avgBytesLabel = fileCount > 0 ? formatBytes(avgBytes) : "—";

  return (
    <StorageDashboard
      totalBytesLabel={formatBytes(totalBytes)}
      fileCount={fileCount}
      bookCount={bookCount}
      booksWithFilesCount={booksWithFilesCount}
      avgBytesLabel={avgBytesLabel}
      mimeBreakdown={mimeBreakdown}
    />
  );
}
