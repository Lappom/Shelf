"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { parseShelfRuleJson, buildShelfRuleWhereSql } from "@/lib/shelves/rules";

const ShelfIdSchema = z.string().uuid();
const BookIdSchema = z.string().uuid();

const CreateShelfSchema = z.object({
  type: z.enum(["manual", "dynamic"]),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).nullable().default(null),
  icon: z.string().trim().max(50).nullable().default(null),
});

const UpdateShelfSchema = z.object({
  shelfId: ShelfIdSchema,
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  icon: z.string().trim().max(50).nullable().optional(),
});

const DeleteShelfSchema = z.object({
  shelfId: ShelfIdSchema,
});

const AddRemoveBookSchema = z.object({
  shelfId: ShelfIdSchema,
  bookId: BookIdSchema,
});

const ReorderShelvesSchema = z.object({
  shelfIds: z.array(ShelfIdSchema).min(1).max(200),
});

const ReorderShelfBooksSchema = z.object({
  shelfId: ShelfIdSchema,
  bookIds: z.array(BookIdSchema).min(1).max(200),
});

const UpdateShelfRuleSchema = z.object({
  shelfId: ShelfIdSchema,
  rules: z.unknown(),
});

const PreviewShelfRuleSchema = z.object({
  rules: z.unknown(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

function systemActionKey(h: Headers, suffix: string) {
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  return `shelves:${suffix}:${ip}`;
}

async function assertActionSecurity(suffix: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: systemActionKey(h, suffix), limit: 60, windowMs: 60_000 });
}

async function getOwnedShelfOrThrow(userId: string, shelfId: string) {
  const shelf = await prisma.shelf.findFirst({
    where: { id: shelfId, ownerId: userId },
    select: { id: true, ownerId: true, type: true },
  });
  if (!shelf) throw new Error("NOT_FOUND");
  return shelf;
}

function assertNotSystemShelf(type: string) {
  if (type === "favorites" || type === "reading") throw new Error("SYSTEM_SHELF");
}

export async function createShelfAction(input: unknown) {
  await assertActionSecurity("create");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = CreateShelfSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const created = await prisma.shelf.create({
    data: {
      ownerId: userId,
      type: parsed.data.type,
      name: parsed.data.name,
      description: parsed.data.description,
      icon: parsed.data.icon,
      sortOrder: 0,
    },
    select: { id: true },
  });

  if (parsed.data.type === "dynamic") {
    await prisma.shelfRule.create({
      data: {
        shelfId: created.id,
        rules: { match: "all", conditions: [] } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
  }

  return { ok: true as const, shelfId: created.id };
}

export async function updateShelfAction(input: unknown) {
  await assertActionSecurity("update");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = UpdateShelfSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelf = await getOwnedShelfOrThrow(userId, parsed.data.shelfId);
  assertNotSystemShelf(shelf.type);

  await prisma.shelf.update({
    where: { id: shelf.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      icon: parsed.data.icon,
    },
    select: { id: true },
  });

  return { ok: true as const };
}

export async function deleteShelfAction(input: unknown) {
  await assertActionSecurity("delete");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = DeleteShelfSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelf = await getOwnedShelfOrThrow(userId, parsed.data.shelfId);
  assertNotSystemShelf(shelf.type);

  await prisma.$transaction(async (tx) => {
    await tx.bookShelf.deleteMany({ where: { shelfId: shelf.id } });
    await tx.shelfRule.deleteMany({ where: { shelfId: shelf.id } });
    await tx.shelf.delete({ where: { id: shelf.id } });
  });

  return { ok: true as const };
}

export async function addBookToShelfAction(input: unknown) {
  await assertActionSecurity("add_book");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = AddRemoveBookSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelf = await getOwnedShelfOrThrow(userId, parsed.data.shelfId);
  if (shelf.type === "reading") return { ok: false as const, error: "UNSUPPORTED" as const };

  await prisma.bookShelf.upsert({
    where: { bookId_shelfId: { bookId: parsed.data.bookId, shelfId: shelf.id } },
    update: {},
    create: { bookId: parsed.data.bookId, shelfId: shelf.id },
  });

  return { ok: true as const };
}

export async function removeBookFromShelfAction(input: unknown) {
  await assertActionSecurity("remove_book");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = AddRemoveBookSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelf = await getOwnedShelfOrThrow(userId, parsed.data.shelfId);
  if (shelf.type === "reading") return { ok: false as const, error: "UNSUPPORTED" as const };

  await prisma.bookShelf.deleteMany({
    where: { shelfId: shelf.id, bookId: parsed.data.bookId },
  });

  return { ok: true as const };
}

export async function reorderShelvesAction(input: unknown) {
  await assertActionSecurity("reorder_shelves");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = ReorderShelvesSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelves = await prisma.shelf.findMany({
    where: { ownerId: userId, id: { in: parsed.data.shelfIds } },
    select: { id: true, type: true },
  });
  if (shelves.length !== parsed.data.shelfIds.length)
    return { ok: false as const, error: "NOT_FOUND" as const };

  // Keep system shelves pinned by their negative sortOrder. Only reorder non-system shelves.
  const reorderable = shelves.filter((s) => s.type !== "favorites" && s.type !== "reading");
  const reorderableIds = new Set(reorderable.map((s) => s.id));

  const finalIds = parsed.data.shelfIds.filter((id) => reorderableIds.has(id));

  await prisma.$transaction(
    finalIds.map((id, idx) =>
      prisma.shelf.update({
        where: { id },
        data: { sortOrder: idx },
        select: { id: true },
      }),
    ),
  );

  return { ok: true as const };
}

export async function reorderShelfBooksAction(input: unknown) {
  await assertActionSecurity("reorder_books");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = ReorderShelfBooksSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelf = await getOwnedShelfOrThrow(userId, parsed.data.shelfId);
  if (shelf.type !== "manual") return { ok: false as const, error: "UNSUPPORTED" as const };

  const existing = await prisma.bookShelf.findMany({
    where: { shelfId: shelf.id },
    select: { bookId: true },
  });
  const existingSet = new Set(existing.map((x) => x.bookId));
  for (const bookId of parsed.data.bookIds) {
    if (!existingSet.has(bookId)) return { ok: false as const, error: "INVALID_INPUT" as const };
  }

  await prisma.$transaction(
    parsed.data.bookIds.map((bookId, idx) =>
      prisma.bookShelf.update({
        where: { bookId_shelfId: { bookId, shelfId: shelf.id } },
        data: { sortOrder: idx },
        select: { bookId: true },
      }),
    ),
  );

  return { ok: true as const };
}

export async function updateShelfRuleAction(input: unknown) {
  await assertActionSecurity("update_rule");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);
  const parsed = UpdateShelfRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const shelf = await getOwnedShelfOrThrow(userId, parsed.data.shelfId);
  if (shelf.type !== "dynamic") return { ok: false as const, error: "UNSUPPORTED" as const };

  let rule;
  try {
    rule = parseShelfRuleJson(parsed.data.rules);
  } catch {
    return { ok: false as const, error: "INVALID_RULES" as const };
  }

  await prisma.shelfRule.upsert({
    where: { shelfId: shelf.id },
    update: { rules: rule as unknown as Prisma.InputJsonValue },
    create: { shelfId: shelf.id, rules: rule as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });

  return { ok: true as const };
}

export async function previewShelfRuleAction(input: unknown) {
  await assertActionSecurity("preview_rule");
  const user = await requireUser();
  void user;
  const parsed = PreviewShelfRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  let rule;
  try {
    rule = parseShelfRuleJson(parsed.data.rules);
  } catch {
    return { ok: false as const, error: "INVALID_RULES" as const };
  }

  const whereSql = buildShelfRuleWhereSql(rule);
  const limit = parsed.data.limit;

  const rows = await prisma.$queryRaw<
    Array<{ id: string; title: string; authors: unknown; created_at: Date }>
  >`
    SELECT b.id, b.title, b.authors, b.created_at
    FROM "books" b
    WHERE b.deleted_at IS NULL
      AND ${whereSql}
    ORDER BY b.created_at DESC
    LIMIT ${limit};
  `;

  const countRes = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "books" b
    WHERE b.deleted_at IS NULL
      AND ${whereSql};
  `;

  const count = Number(countRes[0]?.count ?? BigInt(0));

  return {
    ok: true as const,
    count,
    examples: rows.map((r) => ({ id: r.id, title: r.title, authors: r.authors })),
  };
}
