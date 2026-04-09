import type { AdminAuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Best-effort admin audit row; failures are logged and never throw to callers.
 */
export async function logAdminAudit(args: {
  action: AdminAuditAction;
  actorId: string;
  meta?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        action: args.action,
        actorId: args.actorId,
        meta: args.meta ?? {},
      },
    });
  } catch (e) {
    console.error("[admin_audit] logAdminAudit failed", args.action, e);
  }
}
