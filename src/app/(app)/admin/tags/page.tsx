import { prisma } from "@/lib/db/prisma";
import { requireAdminPage } from "@/lib/auth/rbac";
import { AdminTagsClient, type AdminTagRow } from "./ui";

export default async function AdminTagsPage() {
  await requireAdminPage();

  const tags = await prisma.tag.findMany({
    select: { id: true, name: true, color: true },
    orderBy: [{ name: "asc" }],
    take: 1000,
  });

  const usage = await prisma.bookTag.groupBy({
    by: ["tagId"],
    _count: { bookId: true },
    where: { tagId: { in: tags.map((t) => t.id) } },
  });
  const usageByTagId = new Map(usage.map((u) => [u.tagId, u._count.bookId]));

  const rows: AdminTagRow[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    bookCount: usageByTagId.get(t.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="shelf-hero-enter space-y-1">
        <h2 className="eleven-display-section text-2xl text-foreground sm:text-3xl">Tags</h2>
        <p className="text-eleven-muted eleven-body-airy text-sm tracking-wide">
          Tags globaux (admin) assignables aux livres. Couleur hex + nom unique.
        </p>
      </div>
      <AdminTagsClient initialRows={rows} />
    </div>
  );
}
