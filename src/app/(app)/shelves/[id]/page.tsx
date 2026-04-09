import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { buildShelfRuleWhereSql, parseShelfRuleJson, type ShelfRule } from "@/lib/shelves/rules";
import {
  ShelfDetailClient,
  type ShelfDetailBookRow,
  type ShelfDetailShelf,
} from "@/components/shelf/ShelfDetailClient";

const ParamsSchema = z.object({ id: z.string().uuid() });

function normalizeAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .filter((a): a is string => typeof a === "string" && Boolean(a.trim()))
    .map((a) => a.trim());
}

export default async function ShelfDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const userId = z.string().uuid().parse((user as { id?: unknown }).id);
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) return <div className="p-6">Étagère invalide.</div>;

  const shelf = await prisma.shelf.findFirst({
    where: { id: parsed.data.id, ownerId: userId },
    select: {
      id: true,
      name: true,
      description: true,
      icon: true,
      type: true,
      createdAt: true,
      sortOrder: true,
      rule: { select: { rules: true } },
    },
  });

  if (!shelf) return <div className="p-6">Introuvable.</div>;

  const shelfDto: ShelfDetailShelf = {
    id: shelf.id,
    name: shelf.name,
    description: shelf.description,
    icon: shelf.icon,
    type: shelf.type,
    createdAt: shelf.createdAt.toISOString(),
    rules:
      shelf.type === "dynamic" ? (shelf.rule?.rules ?? { match: "all", conditions: [] }) : null,
  };

  let books: ShelfDetailBookRow[] = [];

  if (shelf.type === "manual" || shelf.type === "favorites") {
    const rows = await prisma.bookShelf.findMany({
      where: { shelfId: shelf.id, book: { deletedAt: null } },
      select: {
        addedAt: true,
        sortOrder: true,
        book: { select: { id: true, title: true, authors: true, format: true, createdAt: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { addedAt: "asc" }],
      take: 500,
    });
    books = rows.map((r) => ({
      id: r.book.id,
      title: r.book.title,
      authors: normalizeAuthors(r.book.authors),
      format: r.book.format,
      addedAt: r.addedAt.toISOString(),
      createdAt: r.book.createdAt.toISOString(),
      shelfSortOrder: r.sortOrder,
    }));
  } else if (shelf.type === "reading") {
    const rows = await prisma.userBookProgress.findMany({
      where: { userId, status: "reading", book: { deletedAt: null } },
      select: {
        updatedAt: true,
        book: { select: { id: true, title: true, authors: true, format: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    books = rows.map((r) => ({
      id: r.book.id,
      title: r.book.title,
      authors: normalizeAuthors(r.book.authors),
      format: r.book.format,
      addedAt: r.updatedAt.toISOString(),
      createdAt: r.book.createdAt.toISOString(),
      shelfSortOrder: 0,
    }));
  } else if (shelf.type === "dynamic") {
    let rule: ShelfRule;
    try {
      rule = parseShelfRuleJson(shelfDto.rules);
    } catch {
      rule = { match: "all", conditions: [] };
    }

    const whereSql = buildShelfRuleWhereSql(rule);
    const rows = await prisma.$queryRaw<
      Array<{ id: string; title: string; authors: unknown; format: string; created_at: Date }>
    >`
      SELECT b.id, b.title, b.authors, b.format, b.created_at
      FROM "books" b
      WHERE b.deleted_at IS NULL
        AND ${whereSql}
      ORDER BY b.created_at DESC
      LIMIT 500;
    `;

    books = rows.map((r) => ({
      id: r.id,
      title: r.title,
      authors: normalizeAuthors(r.authors),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      format: r.format as any,
      addedAt: r.created_at.toISOString(),
      createdAt: r.created_at.toISOString(),
      shelfSortOrder: 0,
    }));
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
      <ShelfDetailClient shelf={shelfDto} initialBooks={books} />
    </div>
  );
}
