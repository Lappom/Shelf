import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";

import { logMcpToolAudit, truncateMcpAuditMessage } from "@/lib/mcp/audit";
import { requireMcpContext } from "@/lib/mcp/context";
import { mcpGuardResource } from "@/lib/mcp/resourcePromptGuard";
import { prisma } from "@/lib/db/prisma";
import { base64UrlDecodeJson, base64UrlEncodeJson } from "@/lib/library/searchBooksForUser";
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

async function auditResourceRead(
  uriStr: string,
  ok: boolean,
  durationMs: number,
  extra?: { resultSummary?: Record<string, unknown>; errorMessage?: string },
) {
  const ctx = requireMcpContext();
  await logMcpToolAudit({
    actorUserId: ctx.userId,
    toolName: `resource:${uriStr}`,
    ok,
    durationMs,
    resultSummary: extra?.resultSummary ?? (ok ? { resultKind: "resource" } : { resultKind: "resource_error" }),
    ...(extra?.errorMessage
      ? { errorMessage: truncateMcpAuditMessage(extra.errorMessage) }
      : {}),
  });
}

function parseCatalogCursor(raw: string | null): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  try {
    const j = base64UrlDecodeJson(raw) as { kind?: string; createdAt?: string; id?: string };
    if (j.kind !== "catalog" || typeof j.id !== "string" || typeof j.createdAt !== "string") return null;
    const createdAt = new Date(j.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    return { createdAt, id: j.id };
  } catch {
    return null;
  }
}

export function registerShelfMcpResources(mcp: McpServer) {
  mcp.registerResource(
    "library_stats",
    "shelf://library/stats",
    { description: "Library-wide stats (formats, languages)." },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("library_stats");
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
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "library_stats", total },
        });
        return jsonResource(uri, {
          total_books: total,
          by_format: rows.map((r) => ({ format: r.format, count: r._count._all })),
          by_language: langRows.map((r) => ({
            language: r.language,
            count: Number(r.c),
          })),
          viewer_user_id: ctx.userId,
        });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "library_catalog",
    "shelf://library/catalog",
    {
      description:
        "Lightweight paginated catalog (id, title, first author). Query: limit (1–100, default 50), cursor (opaque).",
    },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("library_catalog");
        const limitRaw = uri.searchParams.get("limit");
        const limit = Math.min(100, Math.max(1, limitRaw ? Number.parseInt(limitRaw, 10) || 50 : 50));
        const after = parseCatalogCursor(uri.searchParams.get("cursor"));

        const books = await prisma.book.findMany({
          where: {
            deletedAt: null,
            ...(after
              ? {
                  OR: [
                    { createdAt: { lt: after.createdAt } },
                    { AND: [{ createdAt: after.createdAt }, { id: { gt: after.id } }] },
                  ],
                }
              : {}),
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: limit + 1,
          select: { id: true, title: true, authors: true, createdAt: true },
        });

        const hasMore = books.length > limit;
        const page = hasMore ? books.slice(0, limit) : books;
        const last = page[page.length - 1];
        const nextCursor =
          hasMore && last
            ? base64UrlEncodeJson({
                kind: "catalog",
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null;

        const items = page.map((b) => {
          const authors = b.authors as unknown;
          const firstAuthor =
            Array.isArray(authors) && typeof authors[0] === "string" ? authors[0] : null;
          return { id: b.id, title: b.title, author: firstAuthor };
        });

        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "library_catalog", count: items.length },
        });
        return jsonResource(uri, { books: items, next_cursor: nextCursor, has_more: hasMore });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "import_jobs",
    "shelf://jobs/import",
    { description: "Admin: recent import jobs created by this user (aggregated status only)." },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("import_jobs");
        const ctx = requireMcpContext();
        if (ctx.role !== "admin") {
          throw new Error("Forbidden: admin role required");
        }
        const jobs = await prisma.adminImportJob.findMany({
          where: { createdById: ctx.userId },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            type: true,
            status: true,
            processedCandidates: true,
            createdCount: true,
            updatedCount: true,
            skippedCount: true,
            errorCount: true,
            lastError: true,
            createdAt: true,
            finishedAt: true,
          },
        });
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "import_jobs", count: jobs.length },
        });
        return jsonResource(uri, { jobs });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "user_reading_list",
    "shelf://user/reading-list",
    { description: "Books on the user's reading shelf + progress." },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("user_reading_list");
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { ownerId: ctx.userId, type: "reading" },
          select: { id: true },
        });
        if (!shelf) {
          const durationMs = Date.now() - t0;
          await auditResourceRead(uri.toString(), true, durationMs, {
            resultSummary: { resultKind: "reading_list", count: 0 },
          });
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
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "reading_list", count: books.length },
        });
        return jsonResource(uri, { books });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "user_favorites",
    "shelf://user/favorites",
    { description: "Books on the user's favorites shelf." },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("user_favorites");
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { ownerId: ctx.userId, type: "favorites" },
          select: { id: true },
        });
        if (!shelf) {
          const durationMs = Date.now() - t0;
          await auditResourceRead(uri.toString(), true, durationMs, {
            resultSummary: { resultKind: "favorites", count: 0 },
          });
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
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "favorites", count: books.length },
        });
        return jsonResource(uri, { books });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "user_recent_annotations",
    "shelf://user/recent-annotations",
    { description: "20 most recent annotations for the user." },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("user_recent_annotations");
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
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "annotations", count: annotations.length },
        });
        return jsonResource(uri, { annotations });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );

  mcp.registerResource(
    "shelves_overview",
    "shelf://shelves",
    { description: "All shelves with book counts." },
    async (uri) => {
      const t0 = Date.now();
      try {
        await mcpGuardResource("shelves_overview");
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
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "shelves", count: shelves.length },
        });
        return jsonResource(uri, {
          shelves: shelves.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            book_count: s._count.books,
          })),
        });
      } catch (e) {
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
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
      const t0 = Date.now();
      try {
        await mcpGuardResource("book_metadata");
        const id = templateId(variables, "id");
        if (!id) {
          const durationMs = Date.now() - t0;
          await auditResourceRead(uri.toString(), false, durationMs, {
            errorMessage: "invalid book id",
          });
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
          const durationMs = Date.now() - t0;
          await auditResourceRead(uri.toString(), false, durationMs, { errorMessage: "not found" });
          throw new Error("not found");
        }
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "book_metadata", bookId: id },
        });
        return jsonResource(uri, book);
      } catch (e) {
        if (e instanceof Error && (e.message === "invalid book id" || e.message === "not found")) {
          throw e;
        }
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
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
      const t0 = Date.now();
      try {
        await mcpGuardResource("book_annotations");
        const ctx = requireMcpContext();
        const id = templateId(variables, "id");
        if (!id) {
          const durationMs = Date.now() - t0;
          await auditResourceRead(uri.toString(), false, durationMs, {
            errorMessage: "invalid book id",
          });
          throw new Error("invalid book id");
        }
        const book = await prisma.book.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        if (!book) {
          const durationMs = Date.now() - t0;
          await auditResourceRead(uri.toString(), false, durationMs, { errorMessage: "not found" });
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
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), true, durationMs, {
          resultSummary: { resultKind: "book_annotations", count: annotations.length },
        });
        return jsonResource(uri, { annotations });
      } catch (e) {
        if (e instanceof Error && (e.message === "invalid book id" || e.message === "not found")) {
          throw e;
        }
        const durationMs = Date.now() - t0;
        await auditResourceRead(uri.toString(), false, durationMs, {
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        throw new Error("resource read failed");
      }
    },
  );
}
