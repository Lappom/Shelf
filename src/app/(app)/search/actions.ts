"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const UpdatePrefsSchema = z.object({
  booksPerPage: z.union([z.literal(12), z.literal(24), z.literal(48)]).optional(),
  libraryInfiniteScroll: z.boolean().optional(),
});

function actionKey(h: Headers, suffix: string) {
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  return `prefs:${suffix}:${ip}`;
}

async function assertActionSecurity(suffix: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: actionKey(h, suffix), limit: 60, windowMs: 60_000 });
}

export async function updateSearchPreferencesAction(input: unknown) {
  await assertActionSecurity("update_search");
  const user = await requireUser();
  const userId = z.string().uuid().parse((user as { id?: unknown }).id);
  const parsed = UpdatePrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const data = parsed.data;
  if (data.booksPerPage == null && data.libraryInfiniteScroll == null) {
    return { ok: false as const, error: "INVALID_INPUT" as const };
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: {
      ...(data.booksPerPage != null ? { booksPerPage: data.booksPerPage } : {}),
      ...(data.libraryInfiniteScroll != null
        ? { libraryInfiniteScroll: data.libraryInfiniteScroll }
        : {}),
    },
    create: {
      userId,
      theme: "system",
      booksPerPage: data.booksPerPage ?? 24,
      libraryInfiniteScroll: data.libraryInfiniteScroll ?? false,
    },
    select: { id: true },
  });

  return { ok: true as const };
}
