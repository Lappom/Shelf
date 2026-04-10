/**
 * Per-tool MCP rate limits (requests per window). Global HTTP limit still applies first.
 * See docs/SPECS.md §17.8.
 */

const DEFAULT_TOOL_LIMIT = 60;
const DEFAULT_RESOURCE_LIMIT = 120;
const DEFAULT_PROMPT_LIMIT = 60;

const OVERRIDES: Record<string, number> = {
  get_book_content: 20,
  search_catalog: 15,
  bulk_update_books: 10,
  batch_shelf_operations: 20,
  get_all_annotations: 30,
};

export function getMcpToolRateLimit(toolName: string): number {
  if (toolName.startsWith("resource:")) return DEFAULT_RESOURCE_LIMIT;
  if (toolName.startsWith("prompt:")) return DEFAULT_PROMPT_LIMIT;
  return OVERRIDES[toolName] ?? DEFAULT_TOOL_LIMIT;
}
