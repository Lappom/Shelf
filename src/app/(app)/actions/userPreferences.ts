"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ThemeSchema = z.enum(["light", "dark", "system"]);
const LibraryViewSchema = z.enum(["grid", "list"]);

const PatchPrefsSchema = z
  .object({
    theme: ThemeSchema.optional(),
    libraryView: LibraryViewSchema.optional(),
  })
  .strict();

function actionKey(h: Headers, suffix: string) {
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  return `prefs:${suffix}:${ip}`;
}

async function assertActionSecurity(suffix: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: actionKey(h, suffix), limit: 60, windowMs: 60_000 });
}

export async function patchUserPreferencesAction(input: unknown) {
  await assertActionSecurity("patch_user_prefs");
  const user = await requireUser();
  const userId = z.string().uuid().parse((user as { id?: unknown }).id);

  const parsed = PatchPrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };
  const data = parsed.data;

  if (data.theme == null && data.libraryView == null) {
    return { ok: false as const, error: "INVALID_INPUT" as const };
  }

  const updated = await prisma.userPreference.upsert({
    where: { userId },
    update: {
      ...(data.theme != null ? { theme: data.theme } : {}),
      ...(data.libraryView != null ? { libraryView: data.libraryView } : {}),
    },
    create: {
      userId,
      theme: data.theme ?? "system",
      libraryView: data.libraryView ?? "grid",
      booksPerPage: 24,
      libraryInfiniteScroll: false,
    },
    select: { theme: true, libraryView: true },
  });

  return { ok: true as const, prefs: updated };
}

