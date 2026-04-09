"use server";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { updateBookSearchVector } from "@/lib/search/searchVector";

const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color");

const TagNameSchema = z.string().trim().min(1).max(100);

const CreateTagSchema = z.object({
  name: TagNameSchema,
  color: HexColorSchema,
});

const UpdateTagSchema = z.object({
  tagId: z.string().uuid(),
  name: TagNameSchema,
  color: HexColorSchema,
});

const DeleteTagSchema = z.object({
  tagId: z.string().uuid(),
});

async function assertTagNameAvailable(args: { name: string; excludeTagId?: string }) {
  const existing = await prisma.tag.findFirst({
    where: {
      id: args.excludeTagId ? { not: args.excludeTagId } : undefined,
      name: { equals: args.name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) throw new Error("Ce nom de tag existe déjà.");
}

export async function createTagAction(input: unknown) {
  await requireAdmin();
  const parsed = CreateTagSchema.safeParse(input);
  if (!parsed.success) throw new Error("Entrée invalide.");

  await assertTagNameAvailable({ name: parsed.data.name });

  const tag = await prisma.tag.create({
    data: { name: parsed.data.name, color: parsed.data.color },
    select: { id: true, name: true, color: true },
  });

  return { ok: true as const, tag };
}

export async function updateTagAction(input: unknown) {
  await requireAdmin();
  const parsed = UpdateTagSchema.safeParse(input);
  if (!parsed.success) throw new Error("Entrée invalide.");

  const { tagId, name, color } = parsed.data;
  await assertTagNameAvailable({ name, excludeTagId: tagId });

  const before = await prisma.tag.findFirst({
    where: { id: tagId },
    select: { name: true },
  });
  if (!before) throw new Error("Introuvable.");

  const tag = await prisma.tag.update({
    where: { id: tagId },
    data: { name, color },
    select: { id: true, name: true, color: true },
  });

  if (before.name !== tag.name) {
    const bookTags = await prisma.bookTag.findMany({
      where: { tagId },
      select: { bookId: true },
      distinct: ["bookId"],
      take: 2000,
    });
    for (const bt of bookTags) {
      await updateBookSearchVector(bt.bookId);
    }
  }

  return { ok: true as const, tag };
}

export async function deleteTagAction(input: unknown) {
  await requireAdmin();
  const parsed = DeleteTagSchema.safeParse(input);
  if (!parsed.success) throw new Error("Entrée invalide.");

  const used = await prisma.bookTag.count({ where: { tagId: parsed.data.tagId } });
  if (used > 0) {
    throw new Error("Tag utilisé par au moins un livre. Retire-le des livres avant suppression.");
  }

  await prisma.tag.delete({ where: { id: parsed.data.tagId } });
  return { ok: true as const };
}
