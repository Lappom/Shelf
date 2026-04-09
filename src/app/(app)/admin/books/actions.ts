"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter, StorageError } from "@/lib/storage";

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
  await requireAdmin();
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

  return { ok: true as const };
}

