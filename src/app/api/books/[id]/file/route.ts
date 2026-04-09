import { NextResponse } from "next/server";
import { z } from "zod";
import { Readable } from "node:stream";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/rbac";
import { getStorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";

const ParamsSchema = z.object({
  id: z.string().uuid(),
});

function safeContentDispositionFilename(filename: string) {
  const base = (filename || "book.epub").replace(/[\r\n]/g, " ").trim();
  const asciiFallback = base.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(base)}`;
}

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
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  assertSameOriginFromHeaders({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });

  await requireUser();
  const params = await ctx.params;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid book id" }, { status: 400 });

  const book = await prisma.book.findFirst({
    where: { id: parsed.data.id, deletedAt: null },
    select: {
      id: true,
      format: true,
      files: {
        select: { storagePath: true, filename: true, mimeType: true },
        take: 1,
      },
    },
  });

  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (book.format !== "epub") return NextResponse.json({ error: "Not an EPUB" }, { status: 400 });

  const file = book.files[0];
  if (!file) return NextResponse.json({ error: "File missing" }, { status: 404 });

  const adapter = getStorageAdapter();
  try {
    const headers = new Headers({
      "Content-Type": file.mimeType || "application/epub+zip",
      "Content-Disposition": safeContentDispositionFilename(file.filename),
      "Cache-Control": "private, max-age=0, no-store",
    });

    const anyAdapter = adapter as unknown as {
      createReadStream?: (path: string) => Readable | Promise<Readable>;
    };
    if (anyAdapter.createReadStream) {
      const nodeStream = await anyAdapter.createReadStream(file.storagePath);
      const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;
      return addCorsHeaders(new NextResponse(webStream, { headers }), req);
    }

    const buf = await adapter.download(file.storagePath);
    return addCorsHeaders(new NextResponse(new Uint8Array(buf), { headers }), req);
  } catch (e) {
    if (e instanceof StorageError) {
      return addCorsHeaders(
        NextResponse.json({ error: e.message }, { status: storageErrorToStatus(e) }),
        req,
      );
    }
    return addCorsHeaders(NextResponse.json({ error: "Storage error" }, { status: 500 }), req);
  }
}
