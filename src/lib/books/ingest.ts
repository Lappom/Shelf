import { createHash } from "node:crypto";

import { logAdminAudit } from "@/lib/admin/auditLog";
import { prisma } from "@/lib/db/prisma";
import { getStorageAdapter } from "@/lib/storage";
import { buildBookFileStoragePath, buildCoverStoragePath } from "@/lib/storage/paths";
import { extractEpubMetadata } from "@/lib/epub";
import { enrichFromOpenLibraryByIsbn } from "@/lib/metadata/openlibrary";
import { mergeOpenLibraryIntoBookMetadata } from "@/lib/metadata/openlibraryMerge";
import { updateBookSearchVector } from "@/lib/search/searchVector";

type PrismaTransactionArg0 = Parameters<(typeof prisma)["$transaction"]>[0];
type PrismaInteractiveTransactionFn = Exclude<PrismaTransactionArg0, readonly unknown[]>;
type PrismaTransactionClient = Parameters<PrismaInteractiveTransactionFn>[0];

export type IngestEpubResult =
  | { ok: true; bookId: string; restored: boolean }
  | { ok: false; code: "DUPLICATE_ACTIVE"; existingBookId: string }
  | { ok: false; code: "INVALID_EPUB"; message: string };

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

function pickPrimaryAuthor(authors: string[]) {
  return authors[0] ?? "unknown";
}

function normalizeMime(mime: string | null | undefined) {
  const m = (mime ?? "").trim().toLowerCase();
  if (!m) return "application/epub+zip";
  return m;
}

export async function ingestEpub(args: {
  epubBytes: Buffer;
  filename: string;
  mimeType: string | null | undefined;
  addedByUserId: string;
}): Promise<IngestEpubResult> {
  const contentHash = sha256Hex(args.epubBytes);

  const activeDuplicate = await prisma.book.findFirst({
    where: { deletedAt: null, contentHash },
    select: { id: true },
  });
  if (activeDuplicate)
    return { ok: false, code: "DUPLICATE_ACTIVE", existingBookId: activeDuplicate.id };

  const adapter = getStorageAdapter();

  let meta: Awaited<ReturnType<typeof extractEpubMetadata>>;
  try {
    meta = await extractEpubMetadata(args.epubBytes);
  } catch (e) {
    return {
      ok: false,
      code: "INVALID_EPUB",
      message: e instanceof Error ? e.message : "Invalid EPUB",
    };
  }

  const title = meta.title ?? (args.filename.replace(/\.epub$/i, "") || "Untitled");
  const authors = meta.authors.length ? meta.authors : ["Unknown"];
  const language = meta.language;
  const description = meta.description;
  const isbn10 = meta.isbn10;
  const isbn13 = meta.isbn13;

  const isbnForEnrich = isbn13 ?? isbn10;
  const enrichment = isbnForEnrich
    ? await enrichFromOpenLibraryByIsbn(isbnForEnrich).catch(() => null)
    : null;

  const merged = enrichment
    ? mergeOpenLibraryIntoBookMetadata({
        base: {
          title,
          authors,
          language,
          description: description ?? null,
          isbn10: isbn10 ?? null,
          isbn13: isbn13 ?? null,
          publisher: null,
          publishDate: null,
          subjects: [],
          pageCount: null,
          openLibraryId: null,
          coverUrl: null,
        },
        enrichment,
        mode: "complement_only",
      })
    : null;

  const subjects = merged?.subjects ?? [];
  const pageCount = merged?.pageCount ?? null;
  const mergedDescription = merged?.description ?? description ?? null;
  const metadataSource = enrichment ? "openlibrary" : "epub";

  const mimeType = normalizeMime(args.mimeType);

  const fileStoragePath = buildBookFileStoragePath({
    format: "epub",
    author: pickPrimaryAuthor(authors),
    filename: args.filename,
  });

  // Soft-delete restore by content hash first, then by filename.
  const deletedMatch =
    (await prisma.book.findFirst({
      where: { deletedAt: { not: null }, contentHash },
      select: { id: true },
    })) ??
    (await prisma.book.findFirst({
      where: {
        deletedAt: { not: null },
        files: { some: { filename: args.filename } },
      },
      select: { id: true },
    }));

  const now = new Date();

  if (deletedMatch) {
    const bookId = deletedMatch.id;

    // Upload file + cover first; then update DB in a transaction.
    await adapter.upload(args.epubBytes, fileStoragePath);

    let coverPath: string | null = null;
    if (meta.cover) {
      coverPath = buildCoverStoragePath({ bookId, ext: meta.cover.ext });
      await adapter.upload(meta.cover.bytes, coverPath);
    }

    await prisma.$transaction(async (tx: PrismaTransactionClient) => {
      await tx.book.update({
        where: { id: bookId },
        data: {
          deletedAt: null,
          title,
          authors,
          language,
          description: mergedDescription,
          isbn10,
          isbn13,
          subjects,
          pageCount,
          openLibraryId: enrichment?.openLibraryId ?? null,
          metadataSource: metadataSource as never,
          contentHash,
          coverUrl: coverPath,
          updatedAt: now,
        },
      });

      await tx.bookFile.deleteMany({ where: { bookId } });
      await tx.bookFile.create({
        data: {
          bookId,
          filename: args.filename,
          storagePath: fileStoragePath,
          fileSize: BigInt(args.epubBytes.byteLength),
          mimeType,
          contentHash,
        },
        select: { id: true },
      });

      await tx.bookMetadataSnapshot.upsert({
        where: { bookId },
        create: {
          bookId,
          epubMetadata: meta,
          dbMetadata: {
            title,
            authors,
            language,
            description: mergedDescription,
            isbn10,
            isbn13,
            subjects,
            pageCount,
            openLibraryId: enrichment?.openLibraryId ?? null,
          },
          syncedAt: now,
        },
        update: {
          epubMetadata: meta,
          dbMetadata: {
            title,
            authors,
            language,
            description: mergedDescription,
            isbn10,
            isbn13,
            subjects,
            pageCount,
            openLibraryId: enrichment?.openLibraryId ?? null,
          },
          syncedAt: now,
        },
      });
    });

    await updateBookSearchVector(bookId);
    await logAdminAudit({
      action: "epub_ingest",
      actorId: args.addedByUserId,
      meta: {
        bookId,
        restored: true,
        filename: args.filename,
        contentHash,
      },
    });
    return { ok: true, bookId, restored: true };
  }

  // New book creation.
  const created = await prisma.book.create({
    data: {
      title,
      authors,
      subjects,
      format: "epub",
      contentHash,
      isbn10,
      isbn13,
      language,
      description: mergedDescription,
      pageCount,
      openLibraryId: enrichment?.openLibraryId ?? null,
      metadataSource: metadataSource as never,
      addedById: args.addedByUserId,
    },
    select: { id: true },
  });

  const bookId = created.id;

  await adapter.upload(args.epubBytes, fileStoragePath);

  let coverPath: string | null = null;
  if (meta.cover) {
    coverPath = buildCoverStoragePath({ bookId, ext: meta.cover.ext });
    await adapter.upload(meta.cover.bytes, coverPath);
    await prisma.book.update({
      where: { id: bookId },
      data: { coverUrl: coverPath },
      select: { id: true },
    });
  }

  await prisma.$transaction(async (tx: PrismaTransactionClient) => {
    await tx.bookFile.create({
      data: {
        bookId,
        filename: args.filename,
        storagePath: fileStoragePath,
        fileSize: BigInt(args.epubBytes.byteLength),
        mimeType,
        contentHash,
      },
      select: { id: true },
    });

    await tx.bookMetadataSnapshot.create({
      data: {
        bookId,
        epubMetadata: meta,
        dbMetadata: {
          title,
          authors,
          language,
          description: mergedDescription,
          isbn10,
          isbn13,
          subjects,
          pageCount,
          openLibraryId: enrichment?.openLibraryId ?? null,
        },
        syncedAt: now,
      },
      select: { id: true },
    });
  });

  await updateBookSearchVector(bookId);

  await logAdminAudit({
    action: "epub_ingest",
    actorId: args.addedByUserId,
    meta: {
      bookId,
      restored: false,
      filename: args.filename,
      contentHash,
    },
  });

  return { ok: true, bookId, restored: false };
}
