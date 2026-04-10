import type { McpRequestContext } from "@/lib/mcp/context";
import { mcpErrorResult, type McpToolResult } from "@/lib/mcp/toolResult";

/** MCP API key scopes (must match docs/SPECS.md §17.3). */
export const MCP_SCOPES = {
  LIBRARY_READ: "mcp:library:read",
  LIBRARY_CONTENT_READ: "mcp:library:content:read",
  ANNOTATIONS_READ: "mcp:annotations:read",
  ANNOTATIONS_WRITE: "mcp:annotations:write",
  SHELVES_READ: "mcp:shelves:read",
  SHELVES_WRITE: "mcp:shelves:write",
  RECOMMENDATIONS_READ: "mcp:recommendations:read",
  RECOMMENDATIONS_WRITE: "mcp:recommendations:write",
  CATALOG_READ: "mcp:catalog:read",
  ADMIN_BOOKS: "mcp:admin:books",
} as const;

export type McpScopeValue = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];

/** French labels for settings UI */
export const MCP_SCOPE_LABELS_FR: Record<McpScopeValue, string> = {
  [MCP_SCOPES.LIBRARY_READ]: "Bibliothèque — lecture (recherche, liste, fiche)",
  [MCP_SCOPES.LIBRARY_CONTENT_READ]: "Bibliothèque — contenu EPUB (texte chapitre)",
  [MCP_SCOPES.ANNOTATIONS_READ]: "Annotations — lecture",
  [MCP_SCOPES.ANNOTATIONS_WRITE]: "Annotations — création",
  [MCP_SCOPES.SHELVES_READ]: "Étagères — lecture",
  [MCP_SCOPES.SHELVES_WRITE]: "Étagères — modification / lot",
  [MCP_SCOPES.RECOMMENDATIONS_READ]: "Recommandations — lecture",
  [MCP_SCOPES.RECOMMENDATIONS_WRITE]: "Recommandations — feedback / dismiss",
  [MCP_SCOPES.CATALOG_READ]: "Catalogue externe (aperçu)",
  [MCP_SCOPES.ADMIN_BOOKS]: "Admin — livres (création, MAJ, doublons, lot)",
};

/** Allowlist for UI / Server Actions validation. */
export const ALL_MCP_SCOPES: readonly McpScopeValue[] = [
  MCP_SCOPES.LIBRARY_READ,
  MCP_SCOPES.LIBRARY_CONTENT_READ,
  MCP_SCOPES.ANNOTATIONS_READ,
  MCP_SCOPES.ANNOTATIONS_WRITE,
  MCP_SCOPES.SHELVES_READ,
  MCP_SCOPES.SHELVES_WRITE,
  MCP_SCOPES.RECOMMENDATIONS_READ,
  MCP_SCOPES.RECOMMENDATIONS_WRITE,
  MCP_SCOPES.CATALOG_READ,
  MCP_SCOPES.ADMIN_BOOKS,
];

export function parseMcpScopesFromJson(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return null;
  const allowed = new Set<string>(ALL_MCP_SCOPES);
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x === "string" && allowed.has(x)) out.push(x);
  }
  return out.length === 0 ? null : out;
}

export function hasAllMcpScopes(ctx: McpRequestContext, required: readonly string[]): boolean {
  if (ctx.scopes == null || ctx.scopes.length === 0) return true;
  const set = new Set(ctx.scopes);
  return required.every((s) => set.has(s));
}

export function denyUnlessMcpScopes(
  ctx: McpRequestContext,
  required: readonly string[],
): McpToolResult | null {
  if (hasAllMcpScopes(ctx, required)) return null;
  return mcpErrorResult("Forbidden: this API key does not have the required MCP scope(s).");
}

/** Internal resource registration names → required scopes. */
export const MCP_RESOURCE_SCOPES: Record<string, readonly string[]> = {
  library_stats: [MCP_SCOPES.LIBRARY_READ],
  library_catalog: [MCP_SCOPES.LIBRARY_READ],
  user_reading_list: [MCP_SCOPES.LIBRARY_READ],
  user_favorites: [MCP_SCOPES.LIBRARY_READ],
  user_recent_annotations: [MCP_SCOPES.ANNOTATIONS_READ],
  shelves_overview: [MCP_SCOPES.SHELVES_READ],
  book_metadata: [MCP_SCOPES.LIBRARY_READ],
  book_annotations: [MCP_SCOPES.ANNOTATIONS_READ],
  import_jobs: [MCP_SCOPES.ADMIN_BOOKS],
};

export const MCP_PROMPT_SCOPES: Record<string, readonly string[]> = {
  summarize_book: [MCP_SCOPES.LIBRARY_READ, MCP_SCOPES.ANNOTATIONS_READ],
  reading_insights: [
    MCP_SCOPES.LIBRARY_READ,
    MCP_SCOPES.ANNOTATIONS_READ,
    MCP_SCOPES.SHELVES_READ,
  ],
  find_similar: [MCP_SCOPES.LIBRARY_READ],
  shelf_curator: [MCP_SCOPES.LIBRARY_READ, MCP_SCOPES.SHELVES_READ],
  quote_finder: [MCP_SCOPES.ANNOTATIONS_READ],
  batch_shelf_helper: [MCP_SCOPES.SHELVES_WRITE],
  bulk_metadata_helper: [MCP_SCOPES.ADMIN_BOOKS],
};

export const MCP_TOOL_SCOPES: Record<string, readonly string[]> = {
  search_books: [MCP_SCOPES.LIBRARY_READ],
  get_book: [MCP_SCOPES.LIBRARY_READ],
  list_books: [MCP_SCOPES.LIBRARY_READ],
  get_book_content: [MCP_SCOPES.LIBRARY_CONTENT_READ],
  get_annotations: [MCP_SCOPES.ANNOTATIONS_READ],
  get_all_annotations: [MCP_SCOPES.ANNOTATIONS_READ],
  get_reading_progress: [MCP_SCOPES.LIBRARY_READ],
  create_annotation: [MCP_SCOPES.ANNOTATIONS_WRITE],
  list_shelves: [MCP_SCOPES.SHELVES_READ],
  get_shelf_books: [MCP_SCOPES.SHELVES_READ],
  add_to_shelf: [MCP_SCOPES.SHELVES_WRITE],
  remove_from_shelf: [MCP_SCOPES.SHELVES_WRITE],
  batch_shelf_operations: [MCP_SCOPES.SHELVES_WRITE],
  search_catalog: [MCP_SCOPES.CATALOG_READ],
  get_recommendations: [MCP_SCOPES.RECOMMENDATIONS_READ],
  dismiss_recommendation: [MCP_SCOPES.RECOMMENDATIONS_WRITE],
  recommendation_feedback: [MCP_SCOPES.RECOMMENDATIONS_WRITE],
  add_book: [MCP_SCOPES.ADMIN_BOOKS],
  update_book: [MCP_SCOPES.ADMIN_BOOKS],
  bulk_update_books: [MCP_SCOPES.ADMIN_BOOKS],
  delete_book: [MCP_SCOPES.ADMIN_BOOKS],
  scan_duplicates: [MCP_SCOPES.ADMIN_BOOKS],
};
