import Link from "next/link";

import { requireUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { z } from "zod";

import { ALL_MCP_SCOPES, MCP_SCOPE_LABELS_FR, parseMcpScopesFromJson } from "@/lib/mcp/scopes";

import { ApiKeysSettingsClient } from "./ApiKeysSettingsClient";

export default async function ApiKeysSettingsPage() {
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

  const initialKeys = rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: parseMcpScopesFromJson(r.scopes) ?? [],
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const scopeOptions = ALL_MCP_SCOPES.map((id) => ({
    id,
    label: MCP_SCOPE_LABELS_FR[id],
  }));

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clés API MCP</h1>
          <p className="text-eleven-muted mt-1 text-sm">
            Accès programmatique au serveur MCP Shelf (<code className="text-xs">/api/mcp</code>).
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="rounded-eleven-pill">
          <Link href="/library">Retour</Link>
        </Button>
      </div>

      <ApiKeysSettingsClient initialKeys={initialKeys} scopeOptions={scopeOptions} />
    </div>
  );
}
