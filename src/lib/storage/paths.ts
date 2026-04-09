import { StorageError } from "./types";

export function sanitizePathSegment(input: string) {
  const s = input.trim();
  if (!s) throw new StorageError("Invalid path segment.", "INVALID_PATH");
  if (s.includes("/") || s.includes("\\") || s.includes("\0"))
    throw new StorageError("Invalid path segment.", "INVALID_PATH");
  return s;
}

export function slugifyAuthor(author: string) {
  const s = author
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || "unknown";
}

export function buildBookFileStoragePath(args: { format: string; author: string; filename: string }) {
  const format = sanitizePathSegment(args.format);
  const authorSlug = slugifyAuthor(args.author);
  const filename = sanitizePathSegment(args.filename);
  return `${format}/${authorSlug}/${filename}`;
}

export function buildCoverStoragePath(args: { bookId: string; ext: string }) {
  const bookId = sanitizePathSegment(args.bookId);
  const ext = sanitizePathSegment(args.ext).replace(/^\./, "").toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) throw new StorageError("Invalid cover extension.", "INVALID_PATH");
  return `covers/${bookId}.${ext}`;
}

