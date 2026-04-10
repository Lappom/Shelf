"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { decodeRecoCursor, encodeRecoCursor } from "@/lib/recommendations/recoCursor";
import { loadRecommendationsPage } from "@/lib/recommendations/loadRecommendationsPage";
import { recomputeRecommendationsForUser } from "@/lib/recommendations/recomputeForUser";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const RecoUiSourceSchema = z.enum(["carousel", "page"]);

function actionKey(h: Headers, suffix: string) {
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  return `reco:${suffix}:${ip}`;
}

async function assertRecoSecurity(suffix: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: actionKey(h, suffix), limit: 120, windowMs: 60_000 });
}

async function assertRecoAnalyticsForUser(userId: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: `reco:analytics:${userId}`, limit: 90, windowMs: 60_000 });
}

export async function listRecommendationsAction(input: unknown) {
  await assertRecoSecurity("list");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const Schema = z
    .object({
      limit: z.number().int().min(1).max(50).optional(),
      reasonCode: z.string().min(1).max(64).optional().nullable(),
      cursor: z.string().max(500).optional().nullable(),
    })
    .strict();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const cursor = decodeRecoCursor(parsed.data.cursor ?? null);
  const { rows, nextCursor } = await loadRecommendationsPage({
    userId,
    limit: parsed.data.limit ?? 10,
    reasonCode: parsed.data.reasonCode ?? null,
    cursor,
  });

  return {
    ok: true as const,
    items: rows,
    nextCursor: nextCursor ? encodeRecoCursor(nextCursor) : null,
  };
}

export async function dismissRecommendationAction(input: unknown) {
  await assertRecoSecurity("dismiss");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const Schema = z
    .object({
      bookId: z.string().uuid(),
      source: RecoUiSourceSchema.optional(),
    })
    .strict();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const src = parsed.data.source ?? "page";

  const updated = await prisma.userRecommendation.updateMany({
    where: { userId, bookId: parsed.data.bookId, dismissed: false },
    data: { dismissed: true },
  });

  if (updated.count > 0) {
    await prisma.recommendationAnalyticsEvent.create({
      data: {
        userId,
        bookId: parsed.data.bookId,
        event: "dismiss",
        source: src,
      },
    });
  }

  return { ok: true as const };
}

export async function setRecommendationFeedbackAction(input: unknown) {
  await assertRecoSecurity("feedback");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const Schema = z
    .object({
      bookId: z.string().uuid(),
      kind: z.enum(["like", "dislike"]),
      source: RecoUiSourceSchema,
    })
    .strict();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const event = parsed.data.kind === "like" ? "like" : "dislike";

  await prisma.$transaction([
    prisma.userRecommendationFeedback.upsert({
      where: { userId_bookId: { userId, bookId: parsed.data.bookId } },
      create: {
        userId,
        bookId: parsed.data.bookId,
        kind: parsed.data.kind,
      },
      update: { kind: parsed.data.kind },
    }),
    prisma.recommendationAnalyticsEvent.create({
      data: {
        userId,
        bookId: parsed.data.bookId,
        event,
        source: parsed.data.source,
      },
    }),
  ]);

  return { ok: true as const };
}

export async function logRecommendationAnalyticsBatchAction(input: unknown) {
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  await assertRecoAnalyticsForUser(userId);

  const Schema = z
    .object({
      items: z
        .array(
          z
            .object({
              bookId: z.string().uuid(),
              event: z.enum(["impression", "click"]),
              source: RecoUiSourceSchema,
            })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  await prisma.recommendationAnalyticsEvent.createMany({
    data: parsed.data.items.map((i) => ({
      userId,
      bookId: i.bookId,
      event: i.event,
      source: i.source,
    })),
  });

  return { ok: true as const };
}

export async function refreshRecommendationsAction() {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  await rateLimitOrThrow({
    key: `reco:refresh:${userId}`,
    limit: 6,
    windowMs: 3600_000,
  });

  await recomputeRecommendationsForUser(userId);
  return { ok: true as const };
}

export async function markRecommendationsSeenAction(input: unknown) {
  await assertRecoSecurity("seen");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const Schema = z.object({ bookIds: z.array(z.string().uuid()).min(1).max(50) }).strict();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  await prisma.userRecommendation.updateMany({
    where: { userId, bookId: { in: parsed.data.bookIds }, dismissed: false },
    data: { seen: true },
  });

  return { ok: true as const };
}
