import { requireAdminPage } from "@/lib/auth/rbac";
import { pickServerEnvVars } from "@/lib/env/server";

import { AdminMcpOverview } from "./AdminMcpOverview";

function resolveMcpRateLimitPerMinute(raw: string | undefined): number {
  const n = raw?.trim() ? Number.parseInt(raw.trim(), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 60;
}

function buildMcpEndpointUrl(nextAuthUrl: string | undefined): string | null {
  const base = nextAuthUrl?.trim().replace(/\/+$/, "");
  return base ? `${base}/api/mcp` : null;
}

export default async function AdminMcpPage() {
  await requireAdminPage();

  const env = pickServerEnvVars(process.env);
  const mcpEndpointUrl = buildMcpEndpointUrl(env.NEXTAUTH_URL);
  const rateLimitPerMinute = resolveMcpRateLimitPerMinute(process.env.MCP_RATE_LIMIT_PER_MINUTE);

  return (
    <AdminMcpOverview mcpEndpointUrl={mcpEndpointUrl} rateLimitPerMinute={rateLimitPerMinute} />
  );
}
