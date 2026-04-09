import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { logMcpToolAudit } from "@/lib/mcp/audit";
import { requireMcpContext } from "@/lib/mcp/context";

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

async function auditPrompt(name: string, ok: boolean) {
  const ctx = requireMcpContext();
  await logMcpToolAudit({
    actorUserId: ctx.userId,
    toolName: `prompt:${name}`,
    ok,
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
      try {
        const hint = args.book_id
          ? `Focus on book_id=${args.book_id}. `
          : "Pick the most relevant book from context. ";
        await auditPrompt("summarize_book", true);
        return userText(
          `${hint}Use Shelf tools to load metadata and annotations, then produce a concise summary tailored to what the user highlighted.`,
        );
      } catch {
        await auditPrompt("summarize_book", false);
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
      try {
        await auditPrompt("reading_insights", true);
        return userText(
          "Use Shelf resources (reading list, recent annotations, library stats) and progress tools to analyze this user's reading habits and suggest actionable insights.",
        );
      } catch {
        await auditPrompt("reading_insights", false);
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
      try {
        await auditPrompt("find_similar", true);
        return userText(
          `Find books in this Shelf library similar to "${args.title}". Use search_books and metadata to compare authors, subjects, and language.`,
        );
      } catch {
        await auditPrompt("find_similar", false);
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
      try {
        await auditPrompt("shelf_curator", true);
        return userText(
          "Review shelves, reading progress, and favorites. Propose a practical shelf organization (manual shelves, tagging) for this user.",
        );
      } catch {
        await auditPrompt("shelf_curator", false);
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
      try {
        await auditPrompt("quote_finder", true);
        return userText(
          `Search this user's annotations and highlights for passages related to: ${args.subject}. Use get_all_annotations and get_annotations as needed.`,
        );
      } catch {
        await auditPrompt("quote_finder", false);
        throw new Error("prompt failed");
      }
    },
  );
}
