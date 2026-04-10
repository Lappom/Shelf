import { prisma } from "@/lib/db/prisma";
import { requireAdminPage } from "@/lib/auth/rbac";
import { createCoverAccessToken } from "@/lib/cover/coverToken";
import { AdminDuplicatesClient, type AdminDuplicateRow } from "./ui";

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((a): a is string => typeof a === "string").slice(0, 5);
}

export default async function AdminDuplicatesPage() {
  await requireAdminPage();

  const pairs = await prisma.duplicatePair.findMany({
    select: {
      id: true,
      kind: true,
      status: true,
      score: true,
      lastScannedAt: true,
      createdAt: true,
      updatedAt: true,
      mergedIntoBookId: true,
      bookA: { select: { id: true, title: true, authors: true, format: true, coverUrl: true } },
      bookB: { select: { id: true, title: true, authors: true, format: true, coverUrl: true } },
    },
    orderBy: [{ status: "asc" }, { lastScannedAt: "desc" }],
    take: 500,
  });

  const rows: AdminDuplicateRow[] = pairs.map((p) => ({
    id: p.id,
    kind: p.kind,
    status: p.status,
    score: p.score ?? null,
    lastScannedAt: p.lastScannedAt.toISOString(),
    mergedIntoBookId: p.mergedIntoBookId ?? null,
    bookA: {
      id: p.bookA.id,
      title: p.bookA.title,
      authors: normalizeAuthors(p.bookA.authors),
      format: p.bookA.format,
      coverUrl: p.bookA.coverUrl ?? null,
      coverToken: p.bookA.coverUrl ? createCoverAccessToken(p.bookA.id) : null,
    },
    bookB: {
      id: p.bookB.id,
      title: p.bookB.title,
      authors: normalizeAuthors(p.bookB.authors),
      format: p.bookB.format,
      coverUrl: p.bookB.coverUrl ?? null,
      coverToken: p.bookB.coverUrl ? createCoverAccessToken(p.bookB.id) : null,
    },
  }));

  return (
    <div className="admin-dup-shell space-y-6">
      <div className="admin-dup-hero-enter space-y-1">
        <h2 className="eleven-display-section text-2xl tracking-tight sm:text-3xl">Doublons</h2>
        <p className="text-eleven-secondary eleven-body-airy max-w-2xl text-sm leading-relaxed">
          Scan hash (fichiers identiques) et scan fuzzy (titre et auteurs, pg_trgm) pour proposer
          des fusions.
        </p>
      </div>
      <AdminDuplicatesClient initialRows={rows} />
    </div>
  );
}
