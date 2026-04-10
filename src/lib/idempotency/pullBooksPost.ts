import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const PULL_BOOKS_POST_ROUTE = "POST /api/admin/pull-books";

const TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeIdempotencyKeyHeader(raw: string | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t.length === 0 || t.length > 128) return null;
  return t;
}

export function hashPullBooksIdempotency(userId: string, key: string): string {
  return createHash("sha256")
    .update(`${userId}\0${PULL_BOOKS_POST_ROUTE}\0${key}`)
    .digest("hex");
}

function advisoryIntsFromHash(keyHash: string): [number, number] {
  const a = Number.parseInt(keyHash.slice(0, 8), 16);
  const b = Number.parseInt(keyHash.slice(8, 16), 16);
  return [(a >>> 0) | 0, (b >>> 0) | 0];
}

type PullBooksEnqueueTx = (tx: Prisma.TransactionClient) => Promise<{ id: string; status: string }>;

/**
 * Serializes same (user, idempotency key) to return a single job. Advisory lock is transaction-scoped.
 */
export async function enqueuePullBooksWithIdempotency(args: {
  userId: string;
  idempotencyKey: string;
  enqueueTx: PullBooksEnqueueTx;
}): Promise<{ job: { id: string; status: string }; replayed: boolean }> {
  const keyHash = hashPullBooksIdempotency(args.userId, args.idempotencyKey);
  const [k1, k2] = advisoryIntsFromHash(keyHash);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${k1}::integer, ${k2}::integer)`;

    await tx.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    const hit = await tx.idempotencyKey.findUnique({
      where: {
        keyHash_route_userId: {
          keyHash,
          route: PULL_BOOKS_POST_ROUTE,
          userId: args.userId,
        },
      },
    });

    if (hit) {
      const job = await tx.adminImportJob.findUnique({
        where: { id: hit.resourceId },
        select: { id: true, status: true },
      });
      if (job) {
        return { job, replayed: true };
      }
      await tx.idempotencyKey.delete({ where: { id: hit.id } });
    }

    const job = await args.enqueueTx(tx);
    const expiresAt = new Date(Date.now() + TTL_MS);
    await tx.idempotencyKey.create({
      data: {
        keyHash,
        route: PULL_BOOKS_POST_ROUTE,
        userId: args.userId,
        resourceId: job.id,
        expiresAt,
      },
    });
    return { job, replayed: false };
  });
}
