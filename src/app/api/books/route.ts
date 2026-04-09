import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { runApiRoute } from "@/lib/api/route";
import { corsPreflight, getClientIp, parseJsonBody } from "@/lib/api/http";
import { ingestEpub } from "@/lib/books/ingest";
import { prisma } from "@/lib/db/prisma";
import {
  enrichFromOpenLibraryByIsbn,
  searchOpenLibraryByTitleAuthor,
} from "@/lib/metadata/openlibrary";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { updateBookSearchVector } from "@/lib/search/searchVector";
import { getStorageAdapter } from "@/lib/storage";
import { buildCoverStoragePath } from "@/lib/storage/paths";

const MAX_BYTES_DEFAULT = 100 * 1024 * 1024;
const MAX_COVER_BYTES_DEFAULT = 10 * 1024 * 1024;

function getMaxUploadBytes() {
  const raw = process.env.UPLOAD_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return MAX_BYTES_DEFAULT;
}

function getMaxCoverUploadBytes() {
  const raw = process.env.COVER_UPLOAD_MAX_BYTES?.trim();
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return MAX_COVER_BYTES_DEFAULT;
}

function isLikelyEpubMime(mime: string) {
  const m = mime.trim().toLowerCase();
  return m === "application/epub+zip" || m === "application/octet-stream";
}

function normalizeIsbn(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const compact = s.replace(/[\s-]+/g, "").toUpperCase();
  if (/^[0-9]{10}$/.test(compact)) return compact;
  if (/^[0-9]{9}X$/.test(compact)) return compact;
  if (/^[0-9]{13}$/.test(compact)) return compact;
  return null;
}

function splitCsvList(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function detectImageExt(file: File) {
  const name = (file.name || "").toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/);
  const extFromName = match?.[1] ?? null;
  const mime = (file.type || "").toLowerCase();

  const normalized = extFromName === "jpeg" ? "jpg" : extFromName;
  if (normalized && ["jpg", "png", "webp"].includes(normalized)) return normalized;

  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";

  return null;
}

const UploadEpubFormSchema = z.object({
  file: z.instanceof(File),
});

const OpenLibraryPreviewSchema = z.object({
  intent: z.literal("openlibrary_preview_isbn"),
  isbn: z.string().min(1),
});

const OpenLibrarySearchSchema = z.object({
  intent: z.literal("openlibrary_search"),
  title: z.string().min(1),
  author: z.string().min(1),
});

const CreatePhysicalJsonSchema = z.object({
  intent: z.literal("create_physical"),
  title: z.string().min(1).max(500),
  authors: z.array(z.string().min(1)).min(1).max(50),
  isbn: z.string().optional(),
  publisher: z.string().optional(),
  publishDate: z.string().optional(),
  language: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  description: z.string().optional(),
  subjects: z.array(z.string().min(1)).max(50).optional(),
  applyOpenLibrary: z.boolean().optional(),
});

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  return runApiRoute(
    req,
    {
      sameOrigin: true,
      auth: requireAdmin,
    },
    async ({ req, user }) => {
      const adminId = String((user as { id?: unknown }).id ?? "");
      const ip = getClientIp(req);

      const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
      const isJson = contentType.includes("application/json");

      if (isJson) {
        const body = await parseJsonBody(req);

        const preview = OpenLibraryPreviewSchema.safeParse(body);
        if (preview.success) {
          await rateLimitOrThrow({
            key: `books:openlibrary_preview:${adminId}:${ip}`,
            limit: 30,
            windowMs: 60_000,
          });

          const isbn = normalizeIsbn(preview.data.isbn);
          if (!isbn) return NextResponse.json({ error: "Invalid ISBN" }, { status: 400 });

          try {
            const enrichment = await enrichFromOpenLibraryByIsbn(isbn);
            return NextResponse.json({ enrichment }, { status: 200 });
          } catch (e) {
            return NextResponse.json(
              { error: e instanceof Error ? e.message : "OpenLibrary error" },
              { status: 502 },
            );
          }
        }

        const search = OpenLibrarySearchSchema.safeParse(body);
        if (search.success) {
          await rateLimitOrThrow({
            key: `books:openlibrary_search:${adminId}:${ip}`,
            limit: 30,
            windowMs: 60_000,
          });

          try {
            const candidates = await searchOpenLibraryByTitleAuthor({
              title: search.data.title,
              author: search.data.author,
              limit: 10,
            });
            return NextResponse.json({ candidates }, { status: 200 });
          } catch (e) {
            return NextResponse.json(
              { error: e instanceof Error ? e.message : "OpenLibrary error" },
              { status: 502 },
            );
          }
        }

        const create = CreatePhysicalJsonSchema.safeParse(body);
        if (!create.success) {
          return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        await rateLimitOrThrow({
          key: `books:create_physical:${adminId}:${ip}`,
          limit: 20,
          windowMs: 60_000,
        });

        const isbn = normalizeIsbn(create.data.isbn);
        const applyOpenLibrary = Boolean(create.data.applyOpenLibrary);

        if (applyOpenLibrary && !isbn) {
          return NextResponse.json({ error: "Invalid ISBN" }, { status: 400 });
        }

        const enrichment =
          applyOpenLibrary && isbn
            ? await enrichFromOpenLibraryByIsbn(isbn).catch(() => null)
            : null;

        const subjects = create.data.subjects?.length
          ? create.data.subjects
          : (enrichment?.subjects ?? []);
        const pageCount = create.data.pageCount ?? enrichment?.pageCount ?? null;
        const description = create.data.description ?? enrichment?.description ?? null;
        const metadataSource = enrichment ? "openlibrary" : "manual";

        const book = await prisma.book.create({
          data: {
            title: create.data.title,
            authors: create.data.authors,
            isbn10: isbn && isbn.length === 10 ? isbn : null,
            isbn13: isbn && isbn.length === 13 ? isbn : null,
            publisher: create.data.publisher?.trim() || null,
            publishDate: create.data.publishDate?.trim() || null,
            language: create.data.language?.trim() || null,
            pageCount: pageCount ?? null,
            description,
            subjects,
            format: "physical",
            contentHash: null,
            openLibraryId: enrichment?.openLibraryId ?? null,
            metadataSource: metadataSource as never,
            addedById: adminId,
          },
          select: { id: true },
        });

        await updateBookSearchVector(book.id);
        return NextResponse.json({ bookId: book.id }, { status: 201 });
      }

      // Multipart form-data mode (EPUB upload OR physical creation with optional cover)
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
      }

      const maybeFile = formData.get("file");
      if (maybeFile instanceof File) {
        await rateLimitOrThrow({
          key: `books:upload_epub:${adminId}:${ip}`,
          limit: 10,
          windowMs: 60_000,
        });

        const parsed = UploadEpubFormSchema.safeParse({ file: maybeFile });
        if (!parsed.success) {
          return NextResponse.json({ error: "Missing file" }, { status: 400 });
        }

        const file = parsed.data.file;
        const maxBytes = getMaxUploadBytes();
        if (file.size <= 0 || file.size > maxBytes) {
          return NextResponse.json(
            { error: `File too large (max ${maxBytes} bytes)` },
            { status: 400 },
          );
        }

        const filename = (file.name || "book.epub").replace(/[\r\n]/g, " ").trim();
        if (!/\.epub$/i.test(filename)) {
          return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
        }

        if (file.type && !isLikelyEpubMime(file.type)) {
          return NextResponse.json({ error: "Invalid MIME type" }, { status: 400 });
        }

        const buf = Buffer.from(await file.arrayBuffer());

        const res = await ingestEpub({
          epubBytes: buf,
          filename,
          mimeType: file.type,
          addedByUserId: adminId,
        });

        if (!res.ok) {
          if (res.code === "DUPLICATE_ACTIVE") {
            return NextResponse.json(
              { error: "Duplicate book", existingBookId: res.existingBookId },
              { status: 409 },
            );
          }
          return NextResponse.json({ error: res.message }, { status: 400 });
        }

        return NextResponse.json({ bookId: res.bookId, restored: res.restored }, { status: 201 });
      }

      const format = String(formData.get("format") ?? "")
        .trim()
        .toLowerCase();
      if (format !== "physical") {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }

      await rateLimitOrThrow({
        key: `books:create_physical:${adminId}:${ip}`,
        limit: 20,
        windowMs: 60_000,
      });

      const title = String(formData.get("title") ?? "").trim();
      const authors = splitCsvList(formData.get("authors")?.toString() ?? "");
      if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
      if (!authors.length)
        return NextResponse.json({ error: "Authors are required" }, { status: 400 });

      const isbn = normalizeIsbn(formData.get("isbn")?.toString());
      const applyOpenLibrary =
        String(formData.get("applyOpenLibrary") ?? "")
          .trim()
          .toLowerCase() === "true";
      if (applyOpenLibrary && !isbn) {
        return NextResponse.json({ error: "Invalid ISBN" }, { status: 400 });
      }
      const enrichment =
        applyOpenLibrary && isbn ? await enrichFromOpenLibraryByIsbn(isbn).catch(() => null) : null;

      const publisher = String(formData.get("publisher") ?? "").trim() || null;
      const publishDate = String(formData.get("publishDate") ?? "").trim() || null;
      const language = String(formData.get("language") ?? "").trim() || null;
      const pageCountRaw = String(formData.get("pageCount") ?? "").trim();
      const pageCount = pageCountRaw ? Number(pageCountRaw) : NaN;
      const description =
        (String(formData.get("description") ?? "").trim() || null) ??
        enrichment?.description ??
        null;
      const subjects = splitCsvList(formData.get("subjects")?.toString()) ?? [];
      const mergedSubjects = subjects.length ? subjects : (enrichment?.subjects ?? []);
      const mergedPageCount =
        Number.isFinite(pageCount) && pageCount > 0
          ? Math.trunc(pageCount)
          : (enrichment?.pageCount ?? null);
      const metadataSource = enrichment ? "openlibrary" : "manual";

      const coverFile = formData.get("cover");
      let coverToUpload: { ext: string; bytes: Buffer } | null = null;
      if (coverFile instanceof File) {
        const maxCoverBytes = getMaxCoverUploadBytes();
        if (coverFile.size <= 0 || coverFile.size > maxCoverBytes) {
          return NextResponse.json(
            { error: `Cover too large (max ${maxCoverBytes} bytes)` },
            { status: 400 },
          );
        }
        if (coverFile.type && !coverFile.type.toLowerCase().startsWith("image/")) {
          return NextResponse.json({ error: "Invalid cover type" }, { status: 400 });
        }

        const ext = detectImageExt(coverFile);
        if (!ext) return NextResponse.json({ error: "Unsupported cover format" }, { status: 400 });
        coverToUpload = { ext, bytes: Buffer.from(await coverFile.arrayBuffer()) };
      }

      const created = await prisma.book.create({
        data: {
          title,
          authors,
          isbn10: isbn && isbn.length === 10 ? isbn : null,
          isbn13: isbn && isbn.length === 13 ? isbn : null,
          publisher,
          publishDate,
          language,
          pageCount: mergedPageCount,
          description,
          subjects: mergedSubjects,
          format: "physical",
          contentHash: null,
          openLibraryId: enrichment?.openLibraryId ?? null,
          metadataSource: metadataSource as never,
          addedById: adminId,
        },
        select: { id: true },
      });

      if (coverToUpload) {
        const adapter = getStorageAdapter();
        const storagePath = buildCoverStoragePath({ bookId: created.id, ext: coverToUpload.ext });
        await adapter.upload(coverToUpload.bytes, storagePath);

        await prisma.book.update({
          where: { id: created.id },
          data: { coverUrl: storagePath },
          select: { id: true },
        });
      }

      await updateBookSearchVector(created.id);
      return NextResponse.json({ bookId: created.id }, { status: 201 });
    },
  );
}
