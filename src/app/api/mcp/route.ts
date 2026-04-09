import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { parseBearerApiKey } from "@/lib/apiKeys/parseBearer";
import { resolveApiKeyUser, touchApiKeyLastUsed } from "@/lib/apiKeys/resolveApiKeyUser";
import { corsPreflight } from "@/lib/api/http";
import { runWithMcpContext } from "@/lib/mcp/context";
import { createShelfMcpServer } from "@/lib/mcp/shelfMcp/createServer";
import { addCorsHeaders } from "@/lib/security/cors";
import { rateLimit } from "@/lib/security/rateLimit";

function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return addCorsHeaders(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
    req,
  );
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const token = parseBearerApiKey(req.headers.get("authorization"));
  if (!token)
    return jsonResponse(req, 401, { error: "Missing or invalid Authorization Bearer token" });

  const resolved = await resolveApiKeyUser(token);
  if (!resolved) return jsonResponse(req, 401, { error: "Invalid API key" });

  const rl = await rateLimit({
    key: `mcp:apikey:${resolved.apiKeyId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return jsonResponse(req, 429, {
      error: "Rate limit exceeded (60 requests per minute per API key)",
    });
  }

  void touchApiKeyLastUsed(resolved.apiKeyId);

  return runWithMcpContext(
    { userId: resolved.userId, role: resolved.role, apiKeyId: resolved.apiKeyId },
    async () => {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const server = createShelfMcpServer();
      await server.connect(transport);
      try {
        const res = await transport.handleRequest(req);
        return addCorsHeaders(res, req);
      } finally {
        await server.close();
      }
    },
  );
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  return handleMcpRequest(req);
}

export async function POST(req: Request) {
  return handleMcpRequest(req);
}

export async function DELETE(req: Request) {
  return handleMcpRequest(req);
}
