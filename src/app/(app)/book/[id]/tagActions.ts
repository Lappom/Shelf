"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { updateBookSearchVector } from "@/lib/search/searchVector";

const AddSchema = z.object({
  bookId: z.string().uuid(),
  tagId: z.string().uuid(),
});

const RemoveSchema = z.object({
  bookId: z.string().uuid(),
  tagId: z.string().uuid(),
});

export async function addBookTagAction(input: unknown) {
  await requireAdmin();
  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) throw new Error("Entrée invalide.");

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.bookId, deletedAt: null },
    select: { id: true },
  });
  if (!book) throw new Error("Livre introuvable.");

  await prisma.bookTag.upsert({
    where: { bookId_tagId: { bookId: parsed.data.bookId, tagId: parsed.data.tagId } },
    create: { bookId: parsed.data.bookId, tagId: parsed.data.tagId },
    update: {},
  });

  await updateBookSearchVector(parsed.data.bookId);
  return { ok: true as const };
}

export async function removeBookTagAction(input: unknown) {
  await requireAdmin();
  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) throw new Error("Entrée invalide.");

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.bookId, deletedAt: null },
    select: { id: true },
  });
  if (!book) throw new Error("Livre introuvable.");

  await prisma.bookTag.deleteMany({
    where: { bookId: parsed.data.bookId, tagId: parsed.data.tagId },
  });

  await updateBookSearchVector(parsed.data.bookId);
  return { ok: true as const };
}

