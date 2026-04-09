import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { parseBearerApiKey } from "@/lib/apiKeys/parseBearer";
import { resolveApiKeyUser, touchApiKeyLastUsed } from "@/lib/apiKeys/resolveApiKeyUser";
import { corsPreflight } from "@/lib/api/http";
import { runWithMcpContext } from "@/lib/mcp/context";
import { createShelfMcpServer } from "@/lib/mcp/shelfMcp/createServer";
import { logShelfEvent } from "@/lib/observability/structuredLog";
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

function logMcpRequest(method: string, t0: number, res: Response, error?: string) {
  logShelfEvent("mcp_request", {
    method,
    status: res.status,
    durationMs: Date.now() - t0,
    ...(error ? { error } : {}),
  });
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const t0 = Date.now();
  const method = req.method;

  const token = parseBearerApiKey(req.headers.get("authorization"));
  if (!token) {
    const res = jsonResponse(req, 401, { error: "Missing or invalid Authorization Bearer token" });
    logMcpRequest(method, t0, res);
    return res;
  }

  const resolved = await resolveApiKeyUser(token);
  if (!resolved) {
    const res = jsonResponse(req, 401, { error: "Invalid API key" });
    logMcpRequest(method, t0, res);
    return res;
  }

  const rl = await rateLimit({
    key: `mcp:apikey:${resolved.apiKeyId}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    const res = jsonResponse(req, 429, {
      error: "Rate limit exceeded (60 requests per minute per API key)",
    });
    logMcpRequest(method, t0, res);
    return res;
  }

  void touchApiKeyLastUsed(resolved.apiKeyId);

  try {
    const out = await runWithMcpContext(
      { userId: resolved.userId, role: resolved.role, apiKeyId: resolved.apiKeyId },
      async () => {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          // JSON responses: SSE streams do not complete cleanly when inlining the handler in tests / some runtimes.
          enableJsonResponse: true,
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
    logMcpRequest(method, t0, out);
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logShelfEvent("mcp_request", {
      method,
      status: 500,
      durationMs: Date.now() - t0,
      error: msg,
    });
    throw e;
  }
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
