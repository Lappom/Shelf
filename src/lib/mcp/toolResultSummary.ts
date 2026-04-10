import type { McpToolResult } from "@/lib/mcp/toolResult";

/**
 * Non-sensitive aggregates for AdminAuditLog (never full payloads).
 */
export function summarizeMcpToolOutput(toolName: string, out: McpToolResult): Record<string, unknown> {
  if (out.isError) {
    const text = out.content[0]?.type === "text" ? out.content[0].text : "";
    return { resultKind: "error", toolName, messageLen: text.length };
  }
  const text = out.content[0]?.type === "text" ? out.content[0].text : "";
  try {
    const data = JSON.parse(text) as unknown;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const o = data as Record<string, unknown>;
      if (typeof o.applied === "number" && typeof o.failed === "number") {
        return { resultKind: "batch", toolName, applied: o.applied, failed: o.failed };
      }
      if (Array.isArray(o.results)) return { resultKind: "list", toolName, count: o.results.length };
      if (Array.isArray(o.books)) return { resultKind: "books", toolName, count: o.books.length };
      if (Array.isArray(o.shelves)) return { resultKind: "shelves", toolName, count: o.shelves.length };
      if (Array.isArray(o.annotations)) return { resultKind: "annotations", toolName, count: o.annotations.length };
      if (Array.isArray(o.recommendations))
        return { resultKind: "recommendations", toolName, count: o.recommendations.length };
      if (Array.isArray(o.operations)) return { resultKind: "batch_ops", toolName, count: o.operations.length };
      if (o.ok === true) return { resultKind: "ok", toolName };
      if (o.bookId != null) return { resultKind: "id", toolName };
      if (o.candidates != null && Array.isArray(o.candidates))
        return { resultKind: "catalog", toolName, count: o.candidates.length };
    }
  } catch {
    // ignore parse errors
  }
  return { resultKind: "json", toolName, textLen: text.length };
}
