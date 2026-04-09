import { logAdminAudit } from "@/lib/admin/auditLog";

/**
 * Call from `/api/mcp` handlers (Phase 22) after authenticating the API key user.
 * Uses a dedicated meta shape for MCP tool/resource usage.
 */
export async function logMcpToolAudit(args: {
  actorUserId: string;
  toolName: string;
  ok: boolean;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await logAdminAudit({
    action: "mcp_tool_call",
    actorId: args.actorUserId,
    meta: {
      toolName: args.toolName,
      ok: args.ok,
      ...args.meta,
    },
  });
}
