import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureRecommendationsRecomputeJob } from "@/lib/admin/recommendationsRecomputeJobs";
import { getShelfCronSecretFromEnv } from "@/lib/env/server";
import { triggerAdminImportWorker } from "@/lib/jobs/adminImportWorker";

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
  const batchSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(50)
    .parse(url.searchParams.get("batchSize") ?? url.searchParams.get("limit") ?? "25");
  const maxAttempts = z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .parse(url.searchParams.get("maxAttempts") ?? "3");
  const maxChunks = z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .parse(url.searchParams.get("maxChunks") ?? "20");

  const { job, created } = await ensureRecommendationsRecomputeJob({
    batchSize,
    maxAttempts,
  });

  await triggerAdminImportWorker({ maxChunks });

  return NextResponse.json(
    {
      jobId: job.id,
      jobCreated: created,
      batchSize,
      maxChunks,
    },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  return handle(req);
}

/** Some schedulers only support GET; same auth and batching as POST. */
export async function GET(req: Request) {
  return handle(req);
}
