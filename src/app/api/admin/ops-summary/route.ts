import { NextResponse } from "next/server";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getCircuitBreakerSnapshot } from "@/lib/resilience/circuitBreaker";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return runApiRoute(
    req,
    {
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:ops_summary:${adminId}:${ip}`,
          limit: 120,
          windowMs: 60_000,
        });
      },
    },
    async () => {
      const byStatusType = await prisma.adminImportJob.groupBy({
        by: ["status", "type"],
        _count: { _all: true },
      });

      const lastFinished = await prisma.adminImportJob.groupBy({
        by: ["type"],
        _max: { finishedAt: true },
        where: { finishedAt: { not: null } },
      });

      const counts: Record<string, Record<string, number>> = {};
      for (const row of byStatusType) {
        const t = row.type;
        const s = row.status;
        if (!counts[t]) counts[t] = {};
        counts[t]![s] = row._count._all;
      }

      const lastFinishedByType: Record<string, string | null> = {};
      for (const row of lastFinished) {
        lastFinishedByType[row.type] = row._max.finishedAt?.toISOString() ?? null;
      }

      return NextResponse.json(
        {
          importJobCountsByTypeAndStatus: counts,
          lastFinishedAtByType: lastFinishedByType,
          circuitBreakersProcessLocal: getCircuitBreakerSnapshot(),
          circuitBreakerNote:
            "States are per runtime instance only; not reliable under multi-instance serverless.",
        },
        { status: 200 },
      );
    },
  );
}
