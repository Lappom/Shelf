import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logMcpToolAudit, truncateMcpAuditMessage } from "@/lib/mcp/audit";
import { requireMcpContext } from "@/lib/mcp/context";
import { mcpGuardPrompt } from "@/lib/mcp/resourcePromptGuard";

function userText(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

async function auditPrompt(name: string, ok: boolean, durationMs: number, errorMessage?: string) {
  const ctx = requireMcpContext();
  await logMcpToolAudit({
    actorUserId: ctx.userId,
    toolName: `prompt:${name}`,
    ok,
    durationMs,
    resultSummary: { resultKind: ok ? "prompt" : "prompt_error", name },
    ...(errorMessage ? { errorMessage: truncateMcpAuditMessage(errorMessage) } : {}),
  });
}

export function registerShelfMcpPrompts(mcp: McpServer) {
  mcp.registerPrompt(
    "summarize_book",
    {
      description: "Summarize a book using your annotations and highlights.",
      argsSchema: { book_id: z.string().uuid().optional() },
    },
    async (args) => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("summarize_book");
        const hint = args.book_id
          ? `Focus on book_id=${args.book_id}. `
          : "Pick the most relevant book from context. ";
        await auditPrompt("summarize_book", true, Date.now() - t0);
        return userText(
          `${hint}Use Shelf tools to load metadata and annotations, then produce a concise summary tailored to what the user highlighted.`,
        );
      } catch (e) {
        await auditPrompt(
          "summarize_book",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );

  mcp.registerPrompt(
    "reading_insights",
    {
      description: "Analyze reading habits and give insights.",
    },
    async () => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("reading_insights");
        await auditPrompt("reading_insights", true, Date.now() - t0);
        return userText(
          "Use Shelf resources (reading list, recent annotations, library stats) and progress tools to analyze this user's reading habits and suggest actionable insights.",
        );
      } catch (e) {
        await auditPrompt(
          "reading_insights",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );

  mcp.registerPrompt(
    "find_similar",
    {
      description: "Find similar books in the library to a given title.",
      argsSchema: { title: z.string().min(1).max(500) },
    },
    async (args) => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("find_similar");
        await auditPrompt("find_similar", true, Date.now() - t0);
        return userText(
          `Find books in this Shelf library similar to "${args.title}". Use search_books and metadata to compare authors, subjects, and language.`,
        );
      } catch (e) {
        await auditPrompt(
          "find_similar",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );

  mcp.registerPrompt(
    "shelf_curator",
    {
      description: "Suggest shelf organization based on reading history.",
    },
    async () => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("shelf_curator");
        await auditPrompt("shelf_curator", true, Date.now() - t0);
        return userText(
          "Review shelves, reading progress, and favorites. Propose a practical shelf organization (manual shelves, tagging) for this user.",
        );
      } catch (e) {
        await auditPrompt(
          "shelf_curator",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );

  mcp.registerPrompt(
    "quote_finder",
    {
      description: "Find annotated passages about a theme.",
      argsSchema: { subject: z.string().min(1).max(200) },
    },
    async (args) => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("quote_finder");
        await auditPrompt("quote_finder", true, Date.now() - t0);
        return userText(
          `Search this user's annotations and highlights for passages related to: ${args.subject}. Use get_all_annotations and get_annotations as needed.`,
        );
      } catch (e) {
        await auditPrompt(
          "quote_finder",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );

  mcp.registerPrompt(
    "batch_shelf_helper",
    {
      description: "Plan batch shelf adds/removals using batch_shelf_operations.",
    },
    async () => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("batch_shelf_helper");
        await auditPrompt("batch_shelf_helper", true, Date.now() - t0);
        return userText(
          "Use list_shelves and get_shelf_books to understand the user's shelves. Propose a list of add/remove operations, then apply them with batch_shelf_operations (max 30 ops per call). Do not modify the reading shelf.",
        );
      } catch (e) {
        await auditPrompt(
          "batch_shelf_helper",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );

  mcp.registerPrompt(
    "bulk_metadata_helper",
    {
      description: "Plan admin bulk metadata updates with bulk_update_books (human confirmation).",
    },
    async () => {
      const t0 = Date.now();
      try {
        await mcpGuardPrompt("bulk_metadata_helper");
        await auditPrompt("bulk_metadata_helper", true, Date.now() - t0);
        return userText(
          "You are assisting an admin. Use search_books or list_books to find targets. Propose field-level changes, get explicit human confirmation, then apply with bulk_update_books (max 20 books per call). Same field whitelist as update_book.",
        );
      } catch (e) {
        await auditPrompt(
          "bulk_metadata_helper",
          false,
          Date.now() - t0,
          e instanceof Error ? e.message : String(e),
        );
        throw new Error("prompt failed");
      }
    },
  );
}
