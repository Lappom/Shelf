import { NextResponse } from "next/server";
import { z } from "zod";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db/prisma";
import { getOptionalSessionUser } from "@/lib/auth/rbac";
import { verifyCoverAccessToken } from "@/lib/cover/coverToken";
import { getStorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight } from "@/lib/api/http";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

function storageErrorToStatus(e: StorageError) {
  switch (e.code) {
    case "INVALID_PATH":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "TIMEOUT":
      return 504;
    default:
      return 500;
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return runApiRoute(
    req,
    { sameOrigin: true, auth: getOptionalSessionUser },
    async ({ req: innerReq, user }) => {
      const params = await ctx.params;
      const parsed = ParamsSchema.safeParse(params);
      if (!parsed.success) {
        return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
      }

      const url = new URL(innerReq.url);
      const rawT = url.searchParams.get("t")?.trim() ?? "";
      const tokenOk = rawT.length > 0 && verifyCoverAccessToken(rawT, parsed.data.id);
      if (!tokenOk && !user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const book = await prisma.book.findFirst({
        where: { id: parsed.data.id, deletedAt: null },
        select: { id: true, coverUrl: true },
      });
      if (!book) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (!book.coverUrl) {
        return NextResponse.json({ error: "Cover missing" }, { status: 404 });
      }

      const adapter = getStorageAdapter();
      try {
        const headers = new Headers({
          "Content-Type": "image/*",
          "Cache-Control": "private, max-age=0, no-store",
        });

        const nodeStream = await adapter.createReadStream(book.coverUrl);
        const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
        return new NextResponse(webStream, { headers });
      } catch (e) {
        if (e instanceof StorageError) {
          return NextResponse.json({ error: e.message }, { status: storageErrorToStatus(e) });
        }
        return NextResponse.json({ error: "Storage error" }, { status: 500 });
      }
    },
  );
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
