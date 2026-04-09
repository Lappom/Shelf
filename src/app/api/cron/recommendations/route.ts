import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { getShelfCronSecretFromEnv } from "@/lib/env/server";
import { recomputeRecommendationsForUser } from "@/lib/recommendations/recomputeForUser";

function authorizeCron(req: Request): boolean {
  const secret = getShelfCronSecretFromEnv();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = req.headers.get("x-shelf-cron-secret")?.trim() ?? "";
  const token = bearer || headerSecret;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorizeCron(req)) {
    const secret = getShelfCronSecretFromEnv();
    if (!secret) {
      return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(25)
    .parse(url.searchParams.get("limit") ?? "5");
  const afterRaw = url.searchParams.get("after");
  const after =
    afterRaw && z.string().uuid().safeParse(afterRaw).success
      ? z.string().uuid().parse(afterRaw)
      : undefined;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { id: "asc" },
    take: limit,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: { id: true },
  });

  for (const u of users) {
    await recomputeRecommendationsForUser(u.id);
  }

  const nextAfter = users.length === limit ? users[users.length - 1]!.id : null;
  return NextResponse.json({ processed: users.length, nextAfter }, { status: 200 });
}

export async function POST(req: Request) {
  return handle(req);
}

/** Some schedulers only support GET; same auth and batching as POST. */
export async function GET(req: Request) {
  return handle(req);
}
