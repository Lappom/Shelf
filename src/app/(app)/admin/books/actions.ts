"use server";

import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/auditLog";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter, StorageError } from "@/lib/storage";

import {
  ADMIN_BOOKS_PAGE,
  AdminBooksCursorSchema,
  adminBooksB64Decode,
  encodeAdminBooksNextCursor,
  toAdminBookRow,
} from "./adminBooksShared";

const PurgeSchema = z.object({
  bookId: z.string().uuid(),
});

async function deleteFromStorageIfPresent(path: string) {
  const adapter = getStorageAdapter();
  try {
    await adapter.delete(path);
  } catch (e) {
    if (e instanceof StorageError && e.code === "NOT_FOUND") return;
    throw e;
  }
}

export async function purgeBookAction(formData: FormData) {
  const admin = await requireAdmin();
  const actorId = admin.id;
  if (!actorId) throw new Error("Unauthorized");
  const parsed = PurgeSchema.safeParse({
    bookId: formData.get("bookId"),
  });
  if (!parsed.success) throw new Error("Invalid book id");

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.bookId },
    select: {
      id: true,
      deletedAt: true,
      coverUrl: true,
      files: { select: { storagePath: true } },
    },
  });
  if (!book) throw new Error("Not found");
  if (!book.deletedAt) throw new Error("Book must be soft-deleted before purge");

  const storagePaths = new Set<string>();
  for (const f of book.files) storagePaths.add(f.storagePath);
  if (book.coverUrl) storagePaths.add(book.coverUrl);

  for (const path of storagePaths) {
    await deleteFromStorageIfPresent(path);
  }

  await prisma.$transaction(async (tx) => {
    await tx.bookFile.deleteMany({ where: { bookId: book.id } });
    await tx.bookMetadataSnapshot.deleteMany({ where: { bookId: book.id } });
    await tx.bookShelf.deleteMany({ where: { bookId: book.id } });
    await tx.bookTag.deleteMany({ where: { bookId: book.id } });
    await tx.userBookProgress.deleteMany({ where: { bookId: book.id } });
    await tx.userAnnotation.deleteMany({ where: { bookId: book.id } });
    await tx.userRecommendation.deleteMany({ where: { bookId: book.id } });
    await tx.book.delete({ where: { id: book.id } });
  });

  await logAdminAudit({
    action: "book_purge",
    actorId,
    meta: { bookId: book.id },
  });

  return { ok: true as const };
}

export async function loadMoreAdminBooksAction(input: unknown) {
  const admin = await requireAdmin();
  if (!admin.id) throw new Error("Unauthorized");

  const parsed = z.object({ cursor: z.string().trim().min(1).max(768) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  let cur: z.infer<typeof AdminBooksCursorSchema>;
  try {
    cur = AdminBooksCursorSchema.parse(adminBooksB64Decode(parsed.data.cursor));
  } catch {
    return { ok: false as const, error: "INVALID_CURSOR" as const };
  }

  const lastCreated = new Date(cur.c);
  if (!Number.isFinite(lastCreated.getTime()))
    return { ok: false as const, error: "INVALID_CURSOR" as const };

  const take = ADMIN_BOOKS_PAGE + 1;
  const rows = await prisma.book.findMany({
    where: {
      OR: [
        { createdAt: { lt: lastCreated } },
        { AND: [{ createdAt: lastCreated }, { id: { lt: cur.id } }] },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      authors: true,
      format: true,
      deletedAt: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > ADMIN_BOOKS_PAGE;
  const page = hasMore ? rows.slice(0, ADMIN_BOOKS_PAGE) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const L = page[page.length - 1];
    if (L) nextCursor = encodeAdminBooksNextCursor(L);
  }

  return {
    ok: true as const,
    rows: page.map(toAdminBookRow),
    nextCursor,
  };
}
