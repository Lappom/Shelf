import type { Prisma } from "@prisma/client";

import { logAdminAudit } from "@/lib/admin/auditLog";

const MAX_ERROR_META_LEN = 500;

export function truncateMcpAuditMessage(msg: string, maxLen = MAX_ERROR_META_LEN): string {
  if (msg.length <= maxLen) return msg;
  return `${msg.slice(0, maxLen)}…`;
}

/**
 * Call from `/api/mcp` handlers after authenticating the API key user.
 * Uses a dedicated meta shape for MCP tool/resource/prompt usage.
 */
export async function logMcpToolAudit(args: {
  actorUserId: string;
  toolName: string;
  ok: boolean;
  durationMs: number;
  resultSummary?: Record<string, unknown>;
  errorMessage?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const meta = {
    toolName: args.toolName,
    ok: args.ok,
    durationMs: args.durationMs,
    ...(args.resultSummary != null ? { resultSummary: args.resultSummary } : {}),
    ...(args.errorMessage != null
      ? { errorMessage: truncateMcpAuditMessage(args.errorMessage) }
      : {}),
    ...(args.meta ?? {}),
  } as Prisma.InputJsonValue;

  await logAdminAudit({
    action: "mcp_tool_call",
    actorId: args.actorUserId,
    meta,
  });
}
