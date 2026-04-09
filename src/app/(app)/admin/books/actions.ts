"use server";

import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/auditLog";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter, StorageError } from "@/lib/storage";

export const ADMIN_BOOKS_PAGE = 48;

const PurgeSchema = z.object({
  bookId: z.string().uuid(),
});

function adminBooksB64Encode(obj: unknown): string {
  const b64 = Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Cursor for the admin books list (order: createdAt desc, id desc). */
export function encodeAdminBooksCursor(createdAt: Date, id: string): string {
  return adminBooksB64Encode({ c: createdAt.toISOString(), id });
}

function adminBooksB64Decode(s: string): unknown {
  const normalized = s.replaceAll("-", "+").replaceAll("_", "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return JSON.parse(Buffer.from(normalized + pad, "base64").toString("utf8")) as unknown;
}

const AdminBooksCursorSchema = z.object({
  c: z.string(),
  id: z.string().uuid(),
});

function normalizeAuthorsAdmin(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((a): a is string => typeof a === "string").slice(0, 5);
}

export function toAdminBookRow(b: {
  id: string;
  title: string;
  authors: unknown;
  format: string;
  deletedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: b.id,
    title: b.title,
    authors: normalizeAuthorsAdmin(b.authors),
    format: b.format,
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  };
}

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
    if (L) nextCursor = adminBooksB64Encode({ c: L.createdAt.toISOString(), id: L.id });
  }

  return {
    ok: true as const,
    rows: page.map(toAdminBookRow),
    nextCursor,
  };
}
