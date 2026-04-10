import { NextResponse } from "next/server";
import { z } from "zod";

import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp } from "@/lib/api/http";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  analyzeMetadataMerge,
  defaultDecisionsFromAnalysis,
  loadMetadataMergeBookContext,
} from "@/lib/books/metadataMergeResolution";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(
    req,
    {
      auth: requireAdmin,
      rateLimit: async ({ req, user }) => {
        const ip = getClientIp(req);
        const adminId = String((user as { id?: unknown }).id ?? "unknown");
        await rateLimitOrThrow({
          key: `admin:metadata_merge_get:${adminId}:${ip}`,
          limit: 120,
          windowMs: 60_000,
        });
      },
    },
    async () => {
      const params = await ctx.params;
      const idParsed = ParamsSchema.safeParse(params);
      if (!idParsed.success) {
        return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
      }
      const { id } = idParsed.data;
      const loaded = await loadMetadataMergeBookContext(id);
      if (!loaded.ok) {
        const status = loaded.error === "Not found" ? 404 : 400;
        return NextResponse.json({ error: loaded.error }, { status });
      }

      const { ctx: mergeCtx } = loaded;
      const analysis = analyzeMetadataMerge({
        epubNorm: mergeCtx.epubNorm,
        dbNorm: mergeCtx.dbNorm,
        snapNorm: mergeCtx.snapNorm,
      });
      const suggestedDecisions = defaultDecisionsFromAnalysis(analysis.fields);

      return NextResponse.json(
        {
          bookId: mergeCtx.bookId,
          bookTitle: mergeCtx.bookTitle,
          contentHash: mergeCtx.contentHash,
          snapshotSyncedAt: mergeCtx.snapshotSyncedAt,
          fields: analysis.fields,
          automaticMerged: analysis.automaticMerged,
          automaticRequiresWriteback: analysis.requiresWriteback,
          suggestedDecisions,
        },
        { status: 200 },
      );
    },
  );
}
