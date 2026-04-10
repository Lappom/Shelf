import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logMcpToolAudit } from "@/lib/mcp/audit";
import { requireMcpContext } from "@/lib/mcp/context";
import { denyUnlessMcpScopes, MCP_TOOL_SCOPES } from "@/lib/mcp/scopes";
import { summarizeMcpToolOutput } from "@/lib/mcp/toolResultSummary";
import { getMcpToolRateLimit } from "@/lib/mcp/toolRateLimits";
import { mcpErrorResult, mcpJsonResult, type McpToolResult } from "@/lib/mcp/toolResult";
import { logShelfEvent } from "@/lib/observability/structuredLog";
import { rateLimit } from "@/lib/security/rateLimit";
import { createPhysicalBook, CreatePhysicalBookInputSchema } from "@/lib/books/createPhysicalBook";
import { extractEpubChapterPlainText } from "@/lib/epub/chapterText";
import {
  LibrarySortSchema,
  searchBooksForUser,
  type SearchBooksForUserInput,
} from "@/lib/library/searchBooksForUser";
import { prisma } from "@/lib/db/prisma";
import { scanHashCandidates, upsertDuplicatePairs } from "@/lib/admin/duplicates/scan";
import { loadRecommendationsPage } from "@/lib/recommendations/loadRecommendationsPage";
import { scheduleRecommendationsRecompute } from "@/lib/recommendations/trigger";
import { sanitizePlainText } from "@/lib/security/sanitize";
import { updateBookSearchVector } from "@/lib/search/searchVector";
import { getStorageAdapter } from "@/lib/storage";
import { StorageError } from "@/lib/storage";
import { CatalogSearchInputSchema, searchCatalogPreview } from "@/lib/catalog/searchCatalogPreview";

const MCP_DEFAULT_CFI = "mcp:synthetic";

const FiltersSchema = z
  .object({
    formats: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    tagIds: z.array(z.string()).optional(),
    shelfId: z.string().uuid().optional(),
    statuses: z.array(z.string()).optional(),
    author: z.string().optional(),
    publisher: z.string().optional(),
    addedFrom: z.string().optional(),
    addedTo: z.string().optional(),
    pagesMin: z.number().int().optional(),
    pagesMax: z.number().int().optional(),
  })
  .strict()
  .optional();

function filtersToSearchInput(
  userId: string,
  filters: z.infer<typeof FiltersSchema>,
): Partial<SearchBooksForUserInput> {
  if (!filters) return {};
  return {
    formats: filters.formats,
    languages: filters.languages,
    tagIds: filters.tagIds,
    shelfId: filters.shelfId,
    statuses: filters.statuses,
    author: filters.author,
    publisher: filters.publisher,
    addedFrom: filters.addedFrom,
    addedTo: filters.addedTo,
    pagesMin: filters.pagesMin,
    pagesMax: filters.pagesMax,
  };
}

async function runAuditedTool(
  toolName: string,
  fn: () => Promise<McpToolResult>,
): Promise<McpToolResult> {
  const ctx = requireMcpContext();
  const required = MCP_TOOL_SCOPES[toolName];
  if (!required) {
    return mcpErrorResult(`Unknown tool configuration: ${toolName}`);
  }

  const t0 = Date.now();
  const scopeDenied = denyUnlessMcpScopes(ctx, required);
  if (scopeDenied) {
    const durationMs = Date.now() - t0;
    await logMcpToolAudit({
      actorUserId: ctx.userId,
      toolName,
      ok: false,
      durationMs,
      errorMessage: scopeDenied.content[0]?.type === "text" ? scopeDenied.content[0].text : "scope",
      resultSummary: { resultKind: "scope_denied" },
    });
    logShelfEvent("mcp_tool", {
      toolName,
      ok: false,
      durationMs,
      userId: ctx.userId,
      error: "MCP_SCOPE_DENIED",
    });
    return scopeDenied;
  }

  const rl = await rateLimit({
    key: `mcp:tool:${ctx.apiKeyId}:${toolName}`,
    limit: getMcpToolRateLimit(toolName),
    windowMs: 60_000,
  });
  if (!rl.ok) {
    const durationMs = Date.now() - t0;
    await logMcpToolAudit({
      actorUserId: ctx.userId,
      toolName,
      ok: false,
      durationMs,
      errorMessage: "RATE_LIMIT_TOOL",
      resultSummary: { resultKind: "rate_limited" },
    });
    logShelfEvent("mcp_tool", {
      toolName,
      ok: false,
      durationMs,
      userId: ctx.userId,
      error: "RATE_LIMIT_TOOL",
    });
    return mcpErrorResult("Rate limit exceeded for this tool. Try again later.");
  }

  try {
    const out = await fn();
    const durationMs = Date.now() - t0;
    const resultSummary = summarizeMcpToolOutput(toolName, out);
    await logMcpToolAudit({
      actorUserId: ctx.userId,
      toolName,
      ok: !out.isError,
      durationMs,
      resultSummary,
      ...(out.isError
        ? {
            errorMessage:
              out.content[0]?.type === "text" ? out.content[0].text : "tool_error",
          }
        : {}),
    });
    logShelfEvent("mcp_tool", {
      toolName,
      ok: !out.isError,
      durationMs,
      userId: ctx.userId,
    });
    return out;
  } catch (e) {
    const durationMs = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    await logMcpToolAudit({
      actorUserId: ctx.userId,
      toolName,
      ok: false,
      durationMs,
      errorMessage: msg,
      resultSummary: { resultKind: "exception" },
    });
    logShelfEvent("mcp_tool", {
      toolName,
      ok: false,
      durationMs,
      userId: ctx.userId,
      error: msg,
    });
    return mcpErrorResult(e instanceof Error ? e.message : "Internal error");
  }
}

function requireAdmin(ctx: { role: string }): McpToolResult | null {
  if (ctx.role !== "admin") {
    return mcpErrorResult("Forbidden: admin role required");
  }
  return null;
}

const UpdateBookFieldsSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    subtitle: z.string().max(500).nullable().optional(),
    authors: z.array(z.string().min(1)).min(1).max(50).optional(),
    description: z.string().nullable().optional(),
    language: z.string().max(10).nullable().optional(),
    publisher: z.string().max(255).nullable().optional(),
    publishDate: z.string().max(50).nullable().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
    subjects: z.array(z.string().min(1)).max(100).optional(),
  })
  .strict();

export function registerShelfMcpTools(mcp: McpServer) {
  mcp.registerTool(
    "search_books",
    {
      description:
        "Full-text search in the library (same engine as the web UI). Supports cursor pagination and optional FTS snippets.",
      inputSchema: {
        query: z.string().min(1).max(200),
        filters: FiltersSchema,
        limit: z.number().int().min(1).max(50).optional(),
        cursor: z.string().min(1).max(2000).optional(),
        include_snippets: z.boolean().optional(),
      },
    },
    async (args) =>
      runAuditedTool("search_books", async () => {
        const ctx = requireMcpContext();
        const limit = args.limit ?? 20;
        const res = await searchBooksForUser({
          userId: ctx.userId,
          q: args.query,
          limit,
          cursor: args.cursor ?? null,
          mode: "websearch",
          sort: "relevance",
          dir: "desc",
          includeSnippets: args.include_snippets === true,
          ...filtersToSearchInput(ctx.userId, args.filters),
        });
        if (!res.ok) return mcpErrorResult(res.error);
        return mcpJsonResult({ results: res.results, nextCursor: res.nextCursor });
      }),
  );

  mcp.registerTool(
    "get_book",
    {
      description: "Full book metadata (no internal storage paths).",
      inputSchema: { book_id: z.string().uuid() },
    },
    async (args) =>
      runAuditedTool("get_book", async () => {
        const book = await prisma.book.findFirst({
          where: { id: args.book_id, deletedAt: null },
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
            updatedAt: true,
            tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
          },
        });
        if (!book) return mcpErrorResult("Book not found");
        return mcpJsonResult(book);
      }),
  );

  mcp.registerTool(
    "list_books",
    {
      description: "Paginated book list with optional filters (offset pagination).",
      inputSchema: {
        page: z.number().int().min(1).optional(),
        per_page: z.number().int().min(1).max(50).optional(),
        sort: LibrarySortSchema.optional(),
        dir: z.enum(["asc", "desc"]).optional(),
        filters: FiltersSchema,
      },
    },
    async (args) =>
      runAuditedTool("list_books", async () => {
        const ctx = requireMcpContext();
        const page = args.page ?? 1;
        const perPage = args.per_page ?? 20;
        const offset = (page - 1) * perPage;
        const res = await searchBooksForUser({
          userId: ctx.userId,
          q: "",
          limit: perPage,
          offset,
          sort: args.sort ?? "added_at",
          dir: args.dir ?? "desc",
          mode: "websearch",
          ...filtersToSearchInput(ctx.userId, args.filters),
        });
        if (!res.ok) return mcpErrorResult(res.error);
        return mcpJsonResult({
          page,
          per_page: perPage,
          results: res.results,
          has_more: res.results.length === perPage,
        });
      }),
  );

  mcp.registerTool(
    "get_book_content",
    {
      description:
        "Plain text for one EPUB spine chapter. `chapter` is 0-based index along navigable (X)HTML items.",
      inputSchema: {
        book_id: z.string().uuid(),
        chapter: z.number().int().min(0).optional(),
        max_chars: z.number().int().min(1000).max(128_000).optional(),
      },
    },
    async (args) =>
      runAuditedTool("get_book_content", async () => {
        const book = await prisma.book.findFirst({
          where: { id: args.book_id, deletedAt: null },
          select: {
            id: true,
            format: true,
            files: { take: 1, select: { storagePath: true, filename: true } },
          },
        });
        if (!book) return mcpErrorResult("Book not found");
        if (book.format !== "epub") return mcpErrorResult("Not an EPUB book");
        const file = book.files[0];
        if (!file) return mcpErrorResult("EPUB file missing");

        let buf: Buffer;
        try {
          buf = await getStorageAdapter().download(file.storagePath);
        } catch (e) {
          if (e instanceof StorageError) return mcpErrorResult(e.message);
          return mcpErrorResult("Storage error");
        }

        const chapter = args.chapter ?? 0;
        try {
          const extracted = await extractEpubChapterPlainText({
            epubBytes: buf,
            chapterIndex: chapter,
            maxChars: args.max_chars,
          });
          return mcpJsonResult(extracted);
        } catch (e) {
          return mcpErrorResult(e instanceof Error ? e.message : "Extract failed");
        }
      }),
  );

  mcp.registerTool(
    "get_annotations",
    {
      description: "Annotations for one book (current user).",
      inputSchema: {
        book_id: z.string().uuid(),
        type: z.enum(["highlight", "note", "bookmark"]).optional(),
      },
    },
    async (args) =>
      runAuditedTool("get_annotations", async () => {
        const ctx = requireMcpContext();
        const rows = await prisma.userAnnotation.findMany({
          where: {
            userId: ctx.userId,
            bookId: args.book_id,
            ...(args.type ? { type: args.type } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 2000,
        });
        const annotations = rows.map((r) => ({
          ...r,
          content: r.content != null ? sanitizePlainText(r.content, { maxLen: 50_000 }) : null,
          note: r.note != null ? sanitizePlainText(r.note, { maxLen: 50_000 }) : null,
        }));
        return mcpJsonResult({ annotations });
      }),
  );

  mcp.registerTool(
    "get_all_annotations",
    {
      description: "All annotations for the current user.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) =>
      runAuditedTool("get_all_annotations", async () => {
        const ctx = requireMcpContext();
        const limit = args.limit ?? 50;
        const offset = args.offset ?? 0;
        const rows = await prisma.userAnnotation.findMany({
          where: { userId: ctx.userId },
          orderBy: { updatedAt: "desc" },
          skip: offset,
          take: limit,
          select: {
            id: true,
            bookId: true,
            type: true,
            cfiRange: true,
            content: true,
            note: true,
            color: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const annotations = rows.map((r) => ({
          ...r,
          content: r.content != null ? sanitizePlainText(r.content, { maxLen: 50_000 }) : null,
          note: r.note != null ? sanitizePlainText(r.note, { maxLen: 50_000 }) : null,
        }));
        return mcpJsonResult({ annotations, has_more: rows.length === limit });
      }),
  );

  mcp.registerTool(
    "get_reading_progress",
    {
      description: "Reading progress for one book or all books (current user).",
      inputSchema: { book_id: z.string().uuid().optional() },
    },
    async (args) =>
      runAuditedTool("get_reading_progress", async () => {
        const ctx = requireMcpContext();
        const rows = await prisma.userBookProgress.findMany({
          where: {
            userId: ctx.userId,
            ...(args.book_id ? { bookId: args.book_id } : {}),
          },
          select: {
            bookId: true,
            progress: true,
            status: true,
            currentCfi: true,
            currentPage: true,
            totalReadingSeconds: true,
            updatedAt: true,
          },
        });
        return mcpJsonResult({ progress: rows });
      }),
  );

  const ColorSchema = z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional();

  mcp.registerTool(
    "create_annotation",
    {
      description:
        "Create highlight/note/bookmark. Optional cfi_range defaults to a synthetic anchor for MCP-created notes.",
      inputSchema: {
        book_id: z.string().uuid(),
        type: z.enum(["highlight", "note", "bookmark"]),
        content: z.string().max(50_000).optional(),
        note: z.string().max(50_000).optional(),
        cfi_range: z.string().min(1).max(10_000).optional(),
        color: ColorSchema,
      },
    },
    async (args) =>
      runAuditedTool("create_annotation", async () => {
        const ctx = requireMcpContext();
        const book = await prisma.book.findFirst({
          where: { id: args.book_id, deletedAt: null },
          select: { id: true },
        });
        if (!book) return mcpErrorResult("Book not found");

        const cfiRange = args.cfi_range?.trim() || MCP_DEFAULT_CFI;
        const contentRaw = args.content?.trim() ? args.content : null;
        const noteRaw = args.note?.trim() ? args.note : null;
        const content =
          contentRaw != null ? sanitizePlainText(contentRaw, { maxLen: 50_000 }) : null;
        const note = noteRaw != null ? sanitizePlainText(noteRaw, { maxLen: 50_000 }) : null;

        const created = await prisma.userAnnotation.create({
          data: {
            userId: ctx.userId,
            bookId: args.book_id,
            type: args.type,
            cfiRange,
            content,
            note,
            color: args.color ?? null,
          },
        });
        return mcpJsonResult({ id: created.id });
      }),
  );

  mcp.registerTool(
    "list_shelves",
    {
      description: "All shelves owned by the current user.",
    },
    async () =>
      runAuditedTool("list_shelves", async () => {
        const ctx = requireMcpContext();
        const shelves = await prisma.shelf.findMany({
          where: { ownerId: ctx.userId },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
            isPublic: true,
            icon: true,
            _count: { select: { books: true } },
          },
        });
        return mcpJsonResult({
          shelves: shelves.map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            description: s.description,
            is_public: s.isPublic,
            icon: s.icon,
            book_count: s._count.books,
          })),
        });
      }),
  );

  mcp.registerTool(
    "get_shelf_books",
    {
      description: "Books on a shelf (must be owned by the user).",
      inputSchema: { shelf_id: z.string().uuid() },
    },
    async (args) =>
      runAuditedTool("get_shelf_books", async () => {
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { id: args.shelf_id, ownerId: ctx.userId },
          select: { id: true, type: true },
        });
        if (!shelf) return mcpErrorResult("Shelf not found");

        const links = await prisma.bookShelf.findMany({
          where: { shelfId: shelf.id },
          orderBy: [{ sortOrder: "asc" }, { addedAt: "asc" }],
          select: {
            book: {
              select: {
                id: true,
                title: true,
                authors: true,
                format: true,
                language: true,
                deletedAt: true,
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
            format: b.format,
            language: b.language,
          }));
        return mcpJsonResult({ books });
      }),
  );

  mcp.registerTool(
    "add_to_shelf",
    {
      description: "Add a book to a shelf (not allowed for system 'reading' shelf).",
      inputSchema: {
        book_id: z.string().uuid(),
        shelf_id: z.string().uuid(),
      },
    },
    async (args) =>
      runAuditedTool("add_to_shelf", async () => {
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { id: args.shelf_id, ownerId: ctx.userId },
          select: { id: true, type: true },
        });
        if (!shelf) return mcpErrorResult("Shelf not found");
        if (shelf.type === "reading") return mcpErrorResult("Cannot modify reading shelf");

        const book = await prisma.book.findFirst({
          where: { id: args.book_id, deletedAt: null },
          select: { id: true },
        });
        if (!book) return mcpErrorResult("Book not found");

        await prisma.bookShelf.upsert({
          where: { bookId_shelfId: { bookId: args.book_id, shelfId: shelf.id } },
          update: {},
          create: { bookId: args.book_id, shelfId: shelf.id },
        });

        if (shelf.type === "favorites") {
          scheduleRecommendationsRecompute(ctx.userId);
        }

        return mcpJsonResult({ ok: true });
      }),
  );

  mcp.registerTool(
    "remove_from_shelf",
    {
      description: "Remove a book from a shelf (not allowed for system 'reading' shelf).",
      inputSchema: {
        book_id: z.string().uuid(),
        shelf_id: z.string().uuid(),
      },
    },
    async (args) =>
      runAuditedTool("remove_from_shelf", async () => {
        const ctx = requireMcpContext();
        const shelf = await prisma.shelf.findFirst({
          where: { id: args.shelf_id, ownerId: ctx.userId },
          select: { id: true, type: true },
        });
        if (!shelf) return mcpErrorResult("Shelf not found");
        if (shelf.type === "reading") return mcpErrorResult("Cannot modify reading shelf");

        await prisma.bookShelf.deleteMany({
          where: { shelfId: shelf.id, bookId: args.book_id },
        });

        return mcpJsonResult({ ok: true });
      }),
  );

  mcp.registerTool(
    "batch_shelf_operations",
    {
      description:
        "Apply multiple add/remove shelf operations (max 30). Each row is validated; failures are reported per index.",
      inputSchema: {
        operations: z
          .array(
            z
              .object({
                op: z.enum(["add", "remove"]),
                book_id: z.string().uuid(),
                shelf_id: z.string().uuid(),
              })
              .strict(),
          )
          .min(1)
          .max(30),
      },
    },
    async (args) =>
      runAuditedTool("batch_shelf_operations", async () => {
        const ctx = requireMcpContext();
        const errors: { index: number; message: string }[] = [];
        let applied = 0;
        for (let i = 0; i < args.operations.length; i++) {
          const op = args.operations[i]!;
          const shelf = await prisma.shelf.findFirst({
            where: { id: op.shelf_id, ownerId: ctx.userId },
            select: { id: true, type: true },
          });
          if (!shelf) {
            errors.push({ index: i, message: "Shelf not found" });
            continue;
          }
          if (shelf.type === "reading") {
            errors.push({ index: i, message: "Cannot modify reading shelf" });
            continue;
          }
          const book = await prisma.book.findFirst({
            where: { id: op.book_id, deletedAt: null },
            select: { id: true },
          });
          if (!book) {
            errors.push({ index: i, message: "Book not found" });
            continue;
          }
          if (op.op === "add") {
            await prisma.bookShelf.upsert({
              where: { bookId_shelfId: { bookId: op.book_id, shelfId: shelf.id } },
              update: {},
              create: { bookId: op.book_id, shelfId: shelf.id },
            });
            if (shelf.type === "favorites") {
              scheduleRecommendationsRecompute(ctx.userId);
            }
          } else {
            await prisma.bookShelf.deleteMany({
              where: { shelfId: shelf.id, bookId: op.book_id },
            });
          }
          applied += 1;
        }
        return mcpJsonResult({
          ok: errors.length === 0,
          applied,
          failed: errors.length,
          errors,
        });
      }),
  );

  mcp.registerTool(
    "search_catalog",
    {
      description:
        "Search external catalog preview (Open Library + Google Books). Preview only: no database writes.",
      inputSchema: CatalogSearchInputSchema,
    },
    async (args) =>
      runAuditedTool("search_catalog", async () => {
        try {
          const result = await searchCatalogPreview(args);
          return mcpJsonResult(result);
        } catch {
          return mcpErrorResult("Catalog provider unavailable");
        }
      }),
  );

  mcp.registerTool(
    "get_recommendations",
    {
      description: "Personalized recommendations for the current user.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    },
    async (args) =>
      runAuditedTool("get_recommendations", async () => {
        const ctx = requireMcpContext();
        const limit = args.limit ?? 20;
        const { rows } = await loadRecommendationsPage({
          userId: ctx.userId,
          limit,
          cursor: null,
          reasonCode: null,
        });
        return mcpJsonResult({ recommendations: rows });
      }),
  );

  mcp.registerTool(
    "dismiss_recommendation",
    {
      description: "Mark a recommendation as dismissed.",
      inputSchema: { book_id: z.string().uuid() },
    },
    async (args) =>
      runAuditedTool("dismiss_recommendation", async () => {
        const ctx = requireMcpContext();
        const updated = await prisma.userRecommendation.updateMany({
          where: { userId: ctx.userId, bookId: args.book_id, dismissed: false },
          data: { dismissed: true },
        });
        if (updated.count > 0) {
          await prisma.recommendationAnalyticsEvent.create({
            data: {
              userId: ctx.userId,
              bookId: args.book_id,
              event: "dismiss",
              source: "mcp",
            },
          });
        }
        return mcpJsonResult({ ok: true });
      }),
  );

  mcp.registerTool(
    "recommendation_feedback",
    {
      description:
        "Record explicit like or dislike for a recommended book (updates scoring signals and funnel analytics).",
      inputSchema: {
        book_id: z.string().uuid(),
        kind: z.enum(["like", "dislike"]),
      },
    },
    async (args) =>
      runAuditedTool("recommendation_feedback", async () => {
        const ctx = requireMcpContext();
        const event = args.kind === "like" ? "like" : "dislike";
        await prisma.$transaction([
          prisma.userRecommendationFeedback.upsert({
            where: { userId_bookId: { userId: ctx.userId, bookId: args.book_id } },
            create: { userId: ctx.userId, bookId: args.book_id, kind: args.kind },
            update: { kind: args.kind },
          }),
          prisma.recommendationAnalyticsEvent.create({
            data: {
              userId: ctx.userId,
              bookId: args.book_id,
              event,
              source: "mcp",
            },
          }),
        ]);
        return mcpJsonResult({ ok: true });
      }),
  );

  mcp.registerTool(
    "add_book",
    {
      description: "Admin: create a physical book (metadata only).",
      inputSchema: CreatePhysicalBookInputSchema,
    },
    async (args) =>
      runAuditedTool("add_book", async () => {
        const ctx = requireMcpContext();
        const denied = requireAdmin(ctx);
        if (denied) return denied;
        try {
          const { bookId } = await createPhysicalBook({ addedByUserId: ctx.userId, input: args });
          return mcpJsonResult({ bookId });
        } catch (e) {
          if (e instanceof Error && e.message === "INVALID_ISBN") {
            return mcpErrorResult("Invalid ISBN for OpenLibrary lookup");
          }
          throw e;
        }
      }),
  );

  mcp.registerTool(
    "update_book",
    {
      description: "Admin: update whitelisted metadata fields.",
      inputSchema: {
        book_id: z.string().uuid(),
        fields: UpdateBookFieldsSchema,
      },
    },
    async (args) =>
      runAuditedTool("update_book", async () => {
        const ctx = requireMcpContext();
        const denied = requireAdmin(ctx);
        if (denied) return denied;

        const book = await prisma.book.findFirst({
          where: { id: args.book_id },
          select: { id: true, deletedAt: true },
        });
        if (!book || book.deletedAt) return mcpErrorResult("Book not found");

        const f = args.fields;
        await prisma.book.update({
          where: { id: book.id },
          data: {
            ...(f.title != null ? { title: f.title } : {}),
            ...(f.subtitle !== undefined ? { subtitle: f.subtitle } : {}),
            ...(f.authors != null ? { authors: f.authors } : {}),
            ...(f.description !== undefined ? { description: f.description } : {}),
            ...(f.language !== undefined ? { language: f.language } : {}),
            ...(f.publisher !== undefined ? { publisher: f.publisher } : {}),
            ...(f.publishDate !== undefined ? { publishDate: f.publishDate } : {}),
            ...(f.pageCount !== undefined ? { pageCount: f.pageCount } : {}),
            ...(f.subjects != null ? { subjects: f.subjects } : {}),
          },
        });
        await updateBookSearchVector(book.id);
        return mcpJsonResult({ ok: true });
      }),
  );

  mcp.registerTool(
    "bulk_update_books",
    {
      description:
        "Admin: update metadata for up to 20 books in one call. Same field whitelist as update_book; each item is independent.",
      inputSchema: {
        updates: z
          .array(
            z
              .object({
                book_id: z.string().uuid(),
                fields: UpdateBookFieldsSchema,
              })
              .strict(),
          )
          .min(1)
          .max(20),
      },
    },
    async (args) =>
      runAuditedTool("bulk_update_books", async () => {
        const ctx = requireMcpContext();
        const denied = requireAdmin(ctx);
        if (denied) return denied;

        const errors: { book_id: string; message: string }[] = [];
        let applied = 0;
        for (const u of args.updates) {
          const book = await prisma.book.findFirst({
            where: { id: u.book_id },
            select: { id: true, deletedAt: true },
          });
          if (!book || book.deletedAt) {
            errors.push({ book_id: u.book_id, message: "Book not found" });
            continue;
          }
          const f = u.fields;
          try {
            await prisma.book.update({
              where: { id: book.id },
              data: {
                ...(f.title != null ? { title: f.title } : {}),
                ...(f.subtitle !== undefined ? { subtitle: f.subtitle } : {}),
                ...(f.authors != null ? { authors: f.authors } : {}),
                ...(f.description !== undefined ? { description: f.description } : {}),
                ...(f.language !== undefined ? { language: f.language } : {}),
                ...(f.publisher !== undefined ? { publisher: f.publisher } : {}),
                ...(f.publishDate !== undefined ? { publishDate: f.publishDate } : {}),
                ...(f.pageCount !== undefined ? { pageCount: f.pageCount } : {}),
                ...(f.subjects != null ? { subjects: f.subjects } : {}),
              },
            });
            await updateBookSearchVector(book.id);
            applied += 1;
          } catch {
            errors.push({ book_id: u.book_id, message: "Update failed" });
          }
        }
        return mcpJsonResult({
          ok: errors.length === 0,
          applied,
          failed: errors.length,
          errors,
        });
      }),
  );

  mcp.registerTool(
    "delete_book",
    {
      description: "Admin: soft-delete a book.",
      inputSchema: { book_id: z.string().uuid() },
    },
    async (args) =>
      runAuditedTool("delete_book", async () => {
        const ctx = requireMcpContext();
        const denied = requireAdmin(ctx);
        if (denied) return denied;

        const book = await prisma.book.findFirst({
          where: { id: args.book_id },
          select: { id: true, deletedAt: true },
        });
        if (!book) return mcpErrorResult("Book not found");
        if (!book.deletedAt) {
          await prisma.book.update({
            where: { id: book.id },
            data: { deletedAt: new Date() },
          });
        }
        return mcpJsonResult({ ok: true });
      }),
  );

  mcp.registerTool(
    "scan_duplicates",
    {
      description: "Admin: run hash-based duplicate scan and upsert pairs.",
    },
    async () =>
      runAuditedTool("scan_duplicates", async () => {
        const ctx = requireMcpContext();
        const denied = requireAdmin(ctx);
        if (denied) return denied;

        const maxPairs = 500;
        const scannedAt = new Date();
        const candidates = await scanHashCandidates({ maxPairs });
        const ids = new Set<string>();
        for (const c of candidates) {
          ids.add(c.bookIdA);
          ids.add(c.bookIdB);
        }
        const alive = await prisma.book.findMany({
          where: { id: { in: Array.from(ids) }, deletedAt: null },
          select: { id: true },
        });
        const aliveSet = new Set(alive.map((b) => b.id));
        const filtered = candidates.filter(
          (c) => aliveSet.has(c.bookIdA) && aliveSet.has(c.bookIdB),
        );
        const upserted = await upsertDuplicatePairs({
          kind: "hash",
          scannedAt,
          candidates: filtered,
        });
        return mcpJsonResult({
          candidates: candidates.length,
          upserted,
        });
      }),
  );
}
