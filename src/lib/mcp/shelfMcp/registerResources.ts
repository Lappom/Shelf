import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";

import { logMcpToolAudit } from "@/lib/mcp/audit";
import { requireMcpContext } from "@/lib/mcp/context";
import { prisma } from "@/lib/db/prisma";
import { sanitizePlainText } from "@/lib/security/sanitize";

function templateId(variables: Variables, key: string): string | null {
  const raw = variables[key];
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return id;
}

function jsonResource(uri: URL, data: unknown) {
  return {
    contents: [
      {
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function auditResource(uri: string, ok: boolean) {
  const ctx = requireMcpContext();
  await logMcpToolAudit({
    actorUserId: ctx.userId,
    toolName: `resource:${uri}`,
    ok,
  });
}

export function registerShelfMcpResources(mcp: McpServer) {
  mcp.registerResource(
    "library_stats",
    "shelf://library/stats",
    { description: "Library-wide stats (formats, languages)." },
    async (uri) => {
      try {
        const ctx = requireMcpContext();
        const rows = await prisma.book.groupBy({
          by: ["format"],
          where: { deletedAt: null },
          _count: { _all: true },
        });
        const langRows = await prisma.$queryRaw<Array<{ language: string | null; c: bigint }>>`
          SELECT language, COUNT(*)::bigint AS c
          FROM books
          WHERE deleted_at IS NULL
          GROUP BY language
          ORDER BY c DESC
          LIMIT 50
        `;
        const total = await prisma.book.count({ where: { deletedAt: null } });
        await auditResource(uri.toString(), true);
        return jsonResource(uri, {
          total_books: total,
          by_format: rows.map((r) => ({ format: r.format, count: r._count._all })),
          by_language: langRows.map((r) => ({
            language: r.language,
            count: Number(r.c),
          })),
          viewer_user_id: ctx.userId,
        });
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "user_reading_list",
    "shelf://user/reading-list",
    { description: "Books on the user's reading shelf + progress." },
    async (uri) => {
      try {
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { ownerId: ctx.userId, type: "reading" },
          select: { id: true },
        });
        if (!shelf) {
          await auditResource(uri.toString(), true);
          return jsonResource(uri, { books: [] });
        }
        const links = await prisma.bookShelf.findMany({
          where: { shelfId: shelf.id },
          select: {
            book: {
              select: {
                id: true,
                title: true,
                authors: true,
                deletedAt: true,
                progress: {
                  where: { userId: ctx.userId },
                  take: 1,
                  select: { progress: true, status: true, updatedAt: true },
                },
              },
            },
          },
        });
        const books = links
          .map((l) => l.book)
          .filter((b) => !b.deletedAt)
          .map((b) => ({
            id: b.id,
            title: b.title,
            authors: b.authors,
            progress: b.progress[0] ?? null,
          }));
        await auditResource(uri.toString(), true);
        return jsonResource(uri, { books });
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "user_favorites",
    "shelf://user/favorites",
    { description: "Books on the user's favorites shelf." },
    async (uri) => {
      try {
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { ownerId: ctx.userId, type: "favorites" },
          select: { id: true },
        });
        if (!shelf) {
          await auditResource(uri.toString(), true);
          return jsonResource(uri, { books: [] });
        }
        const links = await prisma.bookShelf.findMany({
          where: { shelfId: shelf.id },
          select: {
            book: {
              select: { id: true, title: true, authors: true, deletedAt: true },
            },
          },
        });
        const books = links
          .map((l) => l.book)
          .filter((b) => !b.deletedAt)
          .map((b) => ({ id: b.id, title: b.title, authors: b.authors }));
        await auditResource(uri.toString(), true);
        return jsonResource(uri, { books });
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "user_recent_annotations",
    "shelf://user/recent-annotations",
    { description: "20 most recent annotations for the user." },
    async (uri) => {
      try {
        const ctx = requireMcpContext();
        const rows = await prisma.userAnnotation.findMany({
          where: { userId: ctx.userId },
          orderBy: { updatedAt: "desc" },
          take: 20,
        });
        const annotations = rows.map((r) => ({
          ...r,
          content: r.content != null ? sanitizePlainText(r.content, { maxLen: 50_000 }) : null,
          note: r.note != null ? sanitizePlainText(r.note, { maxLen: 50_000 }) : null,
        }));
        await auditResource(uri.toString(), true);
        return jsonResource(uri, { annotations });
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "shelves_overview",
    "shelf://shelves",
    { description: "All shelves with book counts." },
    async (uri) => {
      try {
        const ctx = requireMcpContext();
        const shelves = await prisma.shelf.findMany({
          where: { ownerId: ctx.userId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            _count: { select: { books: true } },
          },
        });
        await auditResource(uri.toString(), true);
        return jsonResource(uri, {
          shelves: shelves.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            book_count: s._count.books,
          })),
        });
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );

  const bookMetaTemplate = new ResourceTemplate("shelf://book/{id}/metadata", {
    list: undefined,
  });

  mcp.registerResource(
    "book_metadata",
    bookMetaTemplate,
    { description: "Full metadata for a book." },
    async (uri, variables) => {
      try {
        const id = templateId(variables, "id");
        if (!id) {
          await auditResource(uri.toString(), false);
          throw new Error("invalid book id");
        }
        const book = await prisma.book.findFirst({
          where: { id, deletedAt: null },
          select: {
            id: true,
            title: true,
            subtitle: true,
            authors: true,
            isbn10: true,
            isbn13: true,
            publisher: true,
            publishDate: true,
            language: true,
            description: true,
            pageCount: true,
            subjects: true,
            format: true,
            metadataSource: true,
            createdAt: true,
            tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          },
        });
        if (!book) {
          await auditResource(uri.toString(), false);
          throw new Error("not found");
        }
        await auditResource(uri.toString(), true);
        return jsonResource(uri, book);
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );

  const bookAnnTemplate = new ResourceTemplate("shelf://book/{id}/annotations", {
    list: undefined,
  });

  mcp.registerResource(
    "book_annotations",
    bookAnnTemplate,
    { description: "Current user's annotations on a book." },
    async (uri, variables) => {
      try {
        const ctx = requireMcpContext();
        const id = templateId(variables, "id");
        if (!id) {
          await auditResource(uri.toString(), false);
          throw new Error("invalid book id");
        }
        const book = await prisma.book.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        if (!book) {
          await auditResource(uri.toString(), false);
          throw new Error("not found");
        }
        const rows = await prisma.userAnnotation.findMany({
          where: { userId: ctx.userId, bookId: id },
          orderBy: { createdAt: "asc" },
        });
        const annotations = rows.map((r) => ({
          ...r,
          content: r.content != null ? sanitizePlainText(r.content, { maxLen: 50_000 }) : null,
          note: r.note != null ? sanitizePlainText(r.note, { maxLen: 50_000 }) : null,
        }));
        await auditResource(uri.toString(), true);
        return jsonResource(uri, { annotations });
      } catch {
        await auditResource(uri.toString(), false);
        throw new Error("resource read failed");
      }
    },
  );
}
