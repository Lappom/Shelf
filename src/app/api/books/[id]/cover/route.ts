import { NextResponse } from "next/server";
import { z } from "zod";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
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
  return runApiRoute(req, { sameOrigin: true, auth: requireUser }, async () => {
    const params = await ctx.params;
    const parsed = ParamsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid book id" }, { status: 400 });
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

      const anyAdapter = adapter as unknown as {
        createReadStream?: (path: string) => Readable | Promise<Readable>;
      };
      if (anyAdapter.createReadStream) {
        const nodeStream = await anyAdapter.createReadStream(book.coverUrl);
        const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
        return new NextResponse(webStream, { headers });
      }

      const buf = await adapter.download(book.coverUrl);
      return new NextResponse(new Uint8Array(buf), { headers });
    } catch (e) {
      if (e instanceof StorageError) {
        return NextResponse.json({ error: e.message }, { status: storageErrorToStatus(e) });
      }
      return NextResponse.json({ error: "Storage error" }, { status: 500 });
    }
  });
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
