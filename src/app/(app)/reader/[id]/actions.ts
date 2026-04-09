"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ReaderThemeSchema = z.enum(["light", "dark", "sepia"]);
const ReaderFlowSchema = z.enum(["paginated", "scrolled"]);

const UpdateReaderPrefsSchema = z.object({
  readerFontFamily: z.enum(["system", "serif", "sans", "dyslexic"]).optional(),
  readerFontSize: z.number().int().min(12).max(32).optional(),
  readerLineHeight: z.number().min(1.0).max(2.5).optional(),
  readerMargin: z.number().int().min(0).max(80).optional(),
  readerTheme: ReaderThemeSchema.optional(),
  readerFlow: ReaderFlowSchema.optional(),
});

function actionKey(h: Headers, suffix: string) {
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  return `reader_prefs:${suffix}:${ip}`;
}

async function assertActionSecurity(suffix: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: actionKey(h, suffix), limit: 120, windowMs: 60_000 });
}

export async function updateReaderPreferencesAction(input: unknown) {
  await assertActionSecurity("update");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const parsed = UpdateReaderPrefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const data = parsed.data;
  if (
    data.readerFontFamily == null &&
    data.readerFontSize == null &&
    data.readerLineHeight == null &&
    data.readerMargin == null &&
    data.readerTheme == null &&
    data.readerFlow == null
  ) {
    return { ok: false as const, error: "INVALID_INPUT" as const };
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: {
      ...(data.readerFontFamily != null ? { readerFontFamily: data.readerFontFamily } : {}),
      ...(data.readerFontSize != null ? { readerFontSize: data.readerFontSize } : {}),
      ...(data.readerLineHeight != null ? { readerLineHeight: data.readerLineHeight } : {}),
      ...(data.readerMargin != null ? { readerMargin: data.readerMargin } : {}),
      ...(data.readerTheme != null ? { readerTheme: data.readerTheme } : {}),
      ...(data.readerFlow != null ? { readerFlow: data.readerFlow } : {}),
    },
    create: {
      userId,
      theme: "system",
      booksPerPage: 24,
      libraryInfiniteScroll: false,
      readerFontFamily: data.readerFontFamily ?? "system",
      readerFontSize: data.readerFontSize ?? 18,
      readerLineHeight: data.readerLineHeight ?? 1.6,
      readerMargin: data.readerMargin ?? 24,
      readerTheme: data.readerTheme ?? "light",
      readerFlow: data.readerFlow ?? "paginated",
    },
    select: { id: true },
  });

  return { ok: true as const };
}
