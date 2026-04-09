import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { ingestEpub } from "@/lib/books/ingest";
import { handleCorsPreflight, addCorsHeaders } from "@/lib/security/cors";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

const MAX_BYTES_DEFAULT = 100 * 1024 * 1024;

function getMaxUploadBytes() {
  const raw = process.env.UPLOAD_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return MAX_BYTES_DEFAULT;
}

function isLikelyEpubMime(mime: string) {
  const m = mime.trim().toLowerCase();
  return m === "application/epub+zip" || m === "application/octet-stream";
}

const FormSchema = z.object({
  file: z.instanceof(File),
});

export async function OPTIONS(req: Request) {
  const preflight = handleCorsPreflight(req);
  return preflight ?? new Response(null, { status: 204 });
}

export async function POST(req: Request) {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  assertSameOriginFromHeaders({
    origin: req.headers.get("origin"),
    host: req.headers.get("host"),
  });

  // Admin-only
  const admin = await requireAdmin();

  // Rate limit (by IP)
  try {
    await rateLimitOrThrow({
      key: `books:upload:${req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"}`,
      limit: 10,
      windowMs: 60_000,
    });
  } catch {
    return addCorsHeaders(NextResponse.json({ error: "Too many uploads" }, { status: 429 }), req);
  }

  const formData = await req.formData();
  const parsed = FormSchema.safeParse({ file: formData.get("file") });
  if (!parsed.success) {
    return addCorsHeaders(NextResponse.json({ error: "Missing file" }, { status: 400 }), req);
  }

  const file = parsed.data.file;
  const maxBytes = getMaxUploadBytes();
  if (file.size <= 0 || file.size > maxBytes) {
    return addCorsHeaders(
      NextResponse.json({ error: `File too large (max ${maxBytes} bytes)` }, { status: 400 }),
      req,
    );
  }

  const filename = (file.name || "book.epub").replace(/[\r\n]/g, " ").trim();
  if (!/\.epub$/i.test(filename)) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid filename" }, { status: 400 }), req);
  }

  if (file.type && !isLikelyEpubMime(file.type)) {
    return addCorsHeaders(NextResponse.json({ error: "Invalid MIME type" }, { status: 400 }), req);
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const res = await ingestEpub({
    epubBytes: buf,
    filename,
    mimeType: file.type,
    addedByUserId: admin.id,
  });

  if (!res.ok) {
    if (res.code === "DUPLICATE_ACTIVE") {
      return addCorsHeaders(
        NextResponse.json(
          { error: "Duplicate book", existingBookId: res.existingBookId },
          { status: 409 },
        ),
        req,
      );
    }
    return addCorsHeaders(NextResponse.json({ error: res.message }, { status: 400 }), req);
  }

  return addCorsHeaders(
    NextResponse.json({ bookId: res.bookId, restored: res.restored }, { status: 201 }),
    req,
  );
}

