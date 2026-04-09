import { z } from "zod";

export const ADMIN_BOOKS_PAGE = 48;

function adminBooksB64Encode(obj: unknown): string {
  const b64 = Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Cursor for the admin books list (order: createdAt desc, id desc). */
export function encodeAdminBooksCursor(createdAt: Date, id: string): string {
  return adminBooksB64Encode({ c: createdAt.toISOString(), id });
}

export function adminBooksB64Decode(s: string): unknown {
  const normalized = s.replaceAll("-", "+").replaceAll("_", "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return JSON.parse(Buffer.from(normalized + pad, "base64").toString("utf8")) as unknown;
}

export const AdminBooksCursorSchema = z.object({
  c: z.string(),
  id: z.string().uuid(),
});

function normalizeAuthorsAdmin(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors.filter((a): a is string => typeof a === "string").slice(0, 5);
}

export function toAdminBookRow(b: {
  id: string;
  title: string;
  authors: unknown;
  format: string;
  deletedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: b.id,
    title: b.title,
    authors: normalizeAuthorsAdmin(b.authors),
    format: b.format,
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  };
}

/** Encode cursor for the next page from the last row of the current page. */
export function encodeAdminBooksNextCursor(last: { createdAt: Date; id: string }): string {
  return adminBooksB64Encode({ c: last.createdAt.toISOString(), id: last.id });
}
