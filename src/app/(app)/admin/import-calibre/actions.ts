"use server";

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { extractEpubMetadata } from "@/lib/epub";
import { updateBookSearchVector } from "@/lib/search/searchVector";
import { getStorageAdapter } from "@/lib/storage";
import { buildBookFileStoragePath, buildCoverStoragePath } from "@/lib/storage/paths";
import { parseCalibreMetadataDb } from "@/lib/calibre/parseMetadataDb";

const MAX_METADATA_DB_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_ITEMS = 10_000;

function isFileLike(v: unknown): v is File {
  if (!v) return false;
  if (typeof v !== "object") return false;
  return (
    "name" in v &&
    typeof (v as { name: unknown }).name === "string" &&
    "size" in v &&
    typeof (v as { size: unknown }).size === "number" &&
    "arrayBuffer" in v &&
    typeof (v as { arrayBuffer: unknown }).arrayBuffer === "function"
  );
}

const ImportCalibreSchema = z.object({
  metadataDb: z.custom<File>(isFileLike),
  calibreLibraryRoot: z.string().min(1),
  dryRun: z.boolean(),
  limit: z.number().int().positive().max(MAX_IMPORT_ITEMS).nullable(),
  skipCovers: z.boolean(),
});

export type CalibreImportError = {
  calibreBookId: number;
  title: string;
  code:
    | "NO_EPUB_FORMAT"
    | "MISSING_CALIBRE_PATH"
    | "FILE_NOT_FOUND"
    | "PATH_TRAVERSAL"
    | "READ_FAILED"
    | "DB_WRITE_FAILED"
    | "INVALID_DB";
  message: string;
};

export type CalibreImportResult = {
  ok: true;
  dryRun: boolean;
  warnings: string[];
  stats: {
    totalInDb: number;
    considered: number;
    imported: number;
    ignoredDuplicates: number;
    errors: number;
  };
  imported: Array<{
    calibreBookId: number;
    bookId: string;
    title: string;
    contentHash: string;
  }>;
  ignored: Array<{
    calibreBookId: number;
    title: string;
    reason: "duplicate_content_hash";
    existingBookId: string;
  }>;
  errors: CalibreImportError[];
};

function sha256Hex(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

function detectImageExt(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  return "jpg";
}

async function safeResolveUnderRoot(root: string, ...segments: string[]) {
  const rootReal = await fs.realpath(root).catch(() => null);
  if (!rootReal)
    return { ok: false as const, code: "FILE_NOT_FOUND" as const, abs: null as string | null };
  const abs = path.resolve(rootReal, ...segments);
  const absReal = await fs.realpath(abs).catch(() => null);
  if (!absReal)
    return { ok: false as const, code: "FILE_NOT_FOUND" as const, abs: null as string | null };
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep;
  if (!absReal.startsWith(prefix)) {
    return { ok: false as const, code: "PATH_TRAVERSAL" as const, abs: absReal };
  }
  return { ok: true as const, abs: absReal };
}

export async function importCalibreAction(formData: FormData): Promise<CalibreImportResult> {
  const admin = await requireAdmin();
  const adminId = (admin as unknown as { id?: string }).id;
  if (!adminId) throw new Error("Unauthorized");

  const parsed = ImportCalibreSchema.safeParse({
    metadataDb: formData.get("metadataDb"),
    calibreLibraryRoot: String(formData.get("calibreLibraryRoot") ?? "").trim(),
    dryRun: formData.get("dryRun") === "on",
    limit: formData.get("limit") ? Number(formData.get("limit")) : null,
    skipCovers: formData.get("skipCovers") === "on",
  });
  if (!parsed.success) {
    return {
      ok: true,
      dryRun: true,
      warnings: [],
      stats: { totalInDb: 0, considered: 0, imported: 0, ignoredDuplicates: 0, errors: 1 },
      imported: [],
      ignored: [],
      errors: [
        {
          calibreBookId: -1,
          title: "—",
          code: "INVALID_DB",
          message: "Formulaire invalide (metadataDb / calibreLibraryRoot / options).",
        },
      ],
    };
  }

  const dbFile = parsed.data.metadataDb;
  if (!dbFile.name.toLowerCase().endsWith(".db")) {
    throw new Error("metadata.db requis");
  }
  if (dbFile.size > MAX_METADATA_DB_BYTES) {
    throw new Error(`metadata.db trop volumineux (max ${MAX_METADATA_DB_BYTES} bytes)`);
  }

  let calibre;
  try {
    const bytes = new Uint8Array(await dbFile.arrayBuffer());
    calibre = await parseCalibreMetadataDb(bytes);
  } catch {
    return {
      ok: true,
      dryRun: true,
      warnings: [],
      stats: { totalInDb: 0, considered: 0, imported: 0, ignoredDuplicates: 0, errors: 1 },
      imported: [],
      ignored: [],
      errors: [
        {
          calibreBookId: -1,
          title: "—",
          code: "INVALID_DB",
          message: "Impossible de lire `metadata.db` (SQLite).",
        },
      ],
    };
  }

  const warnings = [...calibre.warnings];
  const items = parsed.data.limit ? calibre.books.slice(0, parsed.data.limit) : calibre.books;

  const adapter = getStorageAdapter();

  const imported: CalibreImportResult["imported"] = [];
  const ignored: CalibreImportResult["ignored"] = [];
  const errors: CalibreImportResult["errors"] = [];

  for (const item of items) {
    const title = item.title.slice(0, 500);
    const authors = item.authors.map((a) => a.slice(0, 255)).slice(0, 50);
    const tags = item.tags
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 200);
    const seriesName = item.seriesName ? item.seriesName.slice(0, 255) : null;

    if (!item.epubFileName) {
      errors.push({
        calibreBookId: item.calibreBookId,
        title,
        code: "NO_EPUB_FORMAT",
        message: "Aucun format EPUB trouvé dans Calibre.",
      });
      continue;
    }
    if (!item.calibrePath) {
      errors.push({
        calibreBookId: item.calibreBookId,
        title,
        code: "MISSING_CALIBRE_PATH",
        message: "Chemin Calibre manquant (books.path).",
      });
      continue;
    }

    const resolved = await safeResolveUnderRoot(
      parsed.data.calibreLibraryRoot,
      item.calibrePath,
      item.epubFileName,
    );
    if (!resolved.ok) {
      errors.push({
        calibreBookId: item.calibreBookId,
        title,
        code: resolved.code,
        message:
          resolved.code === "PATH_TRAVERSAL"
            ? "Chemin rejeté (hors du library root)."
            : "Fichier EPUB introuvable sur le serveur.",
      });
      continue;
    }

    let epubBuf: Buffer;
    try {
      epubBuf = await fs.readFile(resolved.abs);
    } catch (e) {
      errors.push({
        calibreBookId: item.calibreBookId,
        title,
        code: "READ_FAILED",
        message: e instanceof Error ? e.message : "Lecture fichier échouée.",
      });
      continue;
    }

    const contentHash = sha256Hex(epubBuf);
    const existing = await prisma.bookFile.findFirst({
      where: { contentHash },
      select: { bookId: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      ignored.push({
        calibreBookId: item.calibreBookId,
        title,
        reason: "duplicate_content_hash",
        existingBookId: existing.bookId,
      });
      continue;
    }

    if (parsed.data.dryRun) {
      imported.push({
        calibreBookId: item.calibreBookId,
        bookId: "dry-run",
        title,
        contentHash,
      });
      continue;
    }

    const authorForPath = authors[0] ?? "unknown";
    const filename = path.basename(item.epubFileName);
    const storagePath = buildBookFileStoragePath({
      format: "epub",
      author: authorForPath,
      filename,
    });

    let finalStoragePath: string;
    try {
      finalStoragePath = await adapter.upload(epubBuf, storagePath);
    } catch (e) {
      errors.push({
        calibreBookId: item.calibreBookId,
        title,
        code: "READ_FAILED",
        message: e instanceof Error ? e.message : "Upload vers storage échoué.",
      });
      continue;
    }

    const bookId = randomUUID();
    let coverUrl: string | null = null;
    if (item.coverImage && !parsed.data.skipCovers) {
      const ext = detectImageExt(item.coverImage);
      const coverPath = buildCoverStoragePath({ bookId, ext });
      try {
        coverUrl = await adapter.upload(Buffer.from(item.coverImage), coverPath);
      } catch {
        coverUrl = null;
      }
    }

    try {
      const epubMeta = await extractEpubMetadata(epubBuf).catch(() => null);

      await prisma.$transaction(async (tx) => {
        await tx.book.create({
          data: {
            id: bookId,
            title,
            authors,
            description: item.description?.slice(0, 200_000) ?? null,
            subjects: [],
            coverUrl,
            format: "epub",
            contentHash,
            metadataSource: "calibre",
            addedById: adminId,
          },
        });

        await tx.bookFile.create({
          data: {
            bookId,
            filename,
            storagePath: finalStoragePath,
            fileSize: BigInt(epubBuf.byteLength),
            mimeType: "application/epub+zip",
            contentHash,
          },
        });

        await tx.bookMetadataSnapshot.create({
          data: {
            bookId,
            epubMetadata: epubMeta ?? {},
            dbMetadata: {
              title,
              authors,
              description: item.description?.slice(0, 200_000) ?? null,
              coverUrl,
              contentHash,
              metadataSource: "calibre",
            },
            syncedAt: new Date(),
          },
        });

        if (tags.length) {
          for (const tagNameRaw of tags) {
            const tagName = tagNameRaw.slice(0, 100);
            if (!tagName) continue;
            const tag = await tx.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName, color: "#888888" },
              select: { id: true },
            });
            await tx.bookTag.upsert({
              where: { bookId_tagId: { bookId, tagId: tag.id } },
              update: {},
              create: { bookId, tagId: tag.id },
            });
          }
        }

        if (seriesName) {
          const shelf =
            (await tx.shelf.findFirst({
              where: { ownerId: adminId, type: "manual", name: seriesName },
              select: { id: true },
            })) ??
            (await tx.shelf.create({
              data: {
                ownerId: adminId,
                type: "manual",
                name: seriesName,
                description: null,
                icon: null,
              },
              select: { id: true },
            }));

          await tx.bookShelf.upsert({
            where: { bookId_shelfId: { bookId, shelfId: shelf.id } },
            update: {},
            create: { bookId, shelfId: shelf.id },
          });
        }
      });

      await updateBookSearchVector(bookId);

      imported.push({ calibreBookId: item.calibreBookId, bookId, title, contentHash });
    } catch (e) {
      errors.push({
        calibreBookId: item.calibreBookId,
        title,
        code: "DB_WRITE_FAILED",
        message: e instanceof Error ? e.message : "Écriture DB échouée.",
      });
    }
  }

  return {
    ok: true,
    dryRun: parsed.data.dryRun,
    warnings,
    stats: {
      totalInDb: calibre.books.length,
      considered: items.length,
      imported: imported.length,
      ignoredDuplicates: ignored.length,
      errors: errors.length,
    },
    imported,
    ignored,
    errors,
  };
}
