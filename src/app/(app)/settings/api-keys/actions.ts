"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/rbac";
import { generateApiKeyMaterial } from "@/lib/apiKeys/crypto";
import { ALL_MCP_SCOPES, parseMcpScopesFromJson, type McpScopeValue } from "@/lib/mcp/scopes";
import { prisma } from "@/lib/db/prisma";
import { assertSameOriginFromHeaders } from "@/lib/security/origin";
import { logShelfEvent } from "@/lib/observability/structuredLog";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";

function actionKey(h: Headers, suffix: string) {
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  return `apikeys:${suffix}:${ip}`;
}

async function assertActionSecurity(suffix: string) {
  const h = await headers();
  assertSameOriginFromHeaders({ origin: h.get("origin"), host: h.get("host") });
  await rateLimitOrThrow({ key: actionKey(h, suffix), limit: 30, windowMs: 60_000 });
}

export async function listApiKeysAction() {
  await assertActionSecurity("list");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const rows = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return {
    ok: true as const,
    keys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      scopes: parseMcpScopesFromJson(r.scopes) ?? [],
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

const CreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    /** Omitted or empty = full MCP access */
    scopes: z.array(z.string()).max(20).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!val.scopes?.length) return;
    const allowed = new Set<string>(ALL_MCP_SCOPES);
    for (const s of val.scopes) {
      if (!allowed.has(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_SCOPE", path: ["scopes"] });
      }
    }
  });

export async function createApiKeyAction(input: unknown) {
  await assertActionSecurity("create");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const { token, hash, prefix } = generateApiKeyMaterial();

  const rawScopes = parsed.data.scopes?.filter(Boolean) ?? [];
  const scopesJson: McpScopeValue[] = rawScopes.filter((s): s is McpScopeValue =>
    ALL_MCP_SCOPES.includes(s as McpScopeValue),
  );

  const created = await prisma.apiKey.create({
    data: {
      userId,
      name: parsed.data.name,
      prefix,
      hash,
      scopes: scopesJson.length > 0 ? scopesJson : undefined,
    },
    select: { id: true },
  });

  logShelfEvent("api_key_create", { ok: true, userId, keyId: created.id });

  return {
    ok: true as const,
    id: created.id,
    token,
    /** Shown once — same as returned token; explicit for UI copy UX */
    displayOnce: true as const,
  };
}

const RevokeSchema = z.object({ id: z.string().uuid() }).strict();

export async function revokeApiKeyAction(input: unknown) {
  await assertActionSecurity("revoke");
  const user = await requireUser();
  const userId = z
    .string()
    .uuid()
    .parse((user as { id?: unknown }).id);

  const parsed = RevokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" as const };

  const res = await prisma.apiKey.updateMany({
    where: { id: parsed.data.id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (res.count === 0) return { ok: false as const, error: "NOT_FOUND" as const };
  logShelfEvent("api_key_revoke", { ok: true, userId, keyId: parsed.data.id });
  return { ok: true as const };
}
