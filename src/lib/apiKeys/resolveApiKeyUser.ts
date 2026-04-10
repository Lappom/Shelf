import type { UserRole } from "@prisma/client";

import { parseMcpScopesFromJson } from "@/lib/mcp/scopes";
import { prisma } from "@/lib/db/prisma";

import { hashApiKeyToken } from "./crypto";

export type ResolvedApiKeyUser = {
  userId: string;
  role: UserRole;
  apiKeyId: string;
  /** null = unrestricted MCP access (legacy / full-access keys) */
  scopes: string[] | null;
};

/**
 * Resolve user from raw token; returns null if invalid, expired, or revoked.
 */
export async function resolveApiKeyUser(rawToken: string): Promise<ResolvedApiKeyUser | null> {
  const hash = hashApiKeyToken(rawToken);
  const now = new Date();
  const row = await prisma.apiKey.findFirst({
    where: {
      hash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true,
      userId: true,
      scopes: true,
      user: { select: { role: true, deletedAt: true } },
    },
  });
  if (!row?.user || row.user.deletedAt) return null;
  return {
    apiKeyId: row.id,
    userId: row.userId,
    role: row.user.role,
    scopes: parseMcpScopesFromJson(row.scopes),
  };
}

/**
 * Best-effort touch last_used_at (never throws).
 */
export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { lastUsedAt: new Date() },
      select: { id: true },
    });
  } catch {
    // ignore
  }
}
