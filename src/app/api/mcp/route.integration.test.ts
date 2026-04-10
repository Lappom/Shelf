import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { generateApiKeyMaterial } from "@/lib/apiKeys/crypto";
import { assertIntegrationDatabaseOrThrow } from "@/lib/db/integrationDb";
import { prisma } from "@/lib/db/prisma";

import { GET, POST } from "./route";

const MCP_TEST_EMAIL = "mcp_route_integration@test.local";
const MCP_URL = new URL("http://test.local/api/mcp");
const { searchOpenLibraryCatalog } = vi.hoisted(() => ({
  searchOpenLibraryCatalog: vi.fn(),
}));

vi.mock("@/lib/metadata/openlibrary", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/metadata/openlibrary")>();
  return {
    ...mod,
    searchOpenLibraryCatalog,
  };
});

let dbAvailable = false;

const mcpFetch: typeof fetch = async (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const req = new Request(url, { ...init, method });
  if (method === "GET") return GET(req);
  if (method === "POST") return POST(req);
  throw new Error(`Unsupported method: ${method}`);
};

describe("POST /api/mcp (Streamable HTTP + API key)", () => {
  let apiToken: string;

  beforeAll(async () => {
    dbAvailable = await assertIntegrationDatabaseOrThrow();
    if (!dbAvailable) return;

    await prisma.adminAuditLog.deleteMany({ where: { actor: { email: MCP_TEST_EMAIL } } });
    await prisma.apiKey.deleteMany({ where: { user: { email: MCP_TEST_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: MCP_TEST_EMAIL } });

    const user = await prisma.user.create({
      data: {
        email: MCP_TEST_EMAIL,
        username: "mcp_route_reader",
        role: "reader",
      },
      select: { id: true },
    });

    const { token, hash, prefix } = generateApiKeyMaterial();
    apiToken = token;
    await prisma.apiKey.create({
      data: { userId: user.id, name: "route-integration", hash, prefix },
    });
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.adminAuditLog.deleteMany({ where: { actor: { email: MCP_TEST_EMAIL } } });
    await prisma.apiKey.deleteMany({ where: { user: { email: MCP_TEST_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: MCP_TEST_EMAIL } });
    await prisma.$disconnect();
  });

  test("initialize, listTools contains list_books, callTool list_books returns JSON payload", async () => {
    if (!dbAvailable) return;

    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      fetch: mcpFetch,
      requestInit: {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
    });

    const client = new Client({ name: "shelf-route-test", version: "0.0.0" });
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.some((t) => t.name === "list_books")).toBe(true);
    expect(listed.tools.some((t) => t.name === "recommendation_feedback")).toBe(true);

    const result = await client.callTool({
      name: "list_books",
      arguments: { page: 1, per_page: 5 },
    });

    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text;
    expect(text).toBeTruthy();
    const payload = JSON.parse(text!) as {
      page: number;
      per_page: number;
      results: unknown[];
      has_more: boolean;
    };
    expect(payload.page).toBe(1);
    expect(payload.per_page).toBe(5);
    expect(Array.isArray(payload.results)).toBe(true);

    await transport.close();
  });

  test("callTool search_catalog returns preview candidates", async () => {
    if (!dbAvailable) return;
    searchOpenLibraryCatalog.mockResolvedValueOnce([
      {
        key: "/works/OL1W",
        title: "Foundation",
        authors: ["Isaac Asimov"],
        firstPublishYear: 1951,
        isbns: ["9780553293357"],
      },
    ]);

    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      fetch: mcpFetch,
      requestInit: { headers: { Authorization: `Bearer ${apiToken}` } },
    });
    const client = new Client({ name: "shelf-route-test", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "search_catalog",
      arguments: { q: "foundation", limit: 5 },
    });
    expect(result.isError).not.toBe(true);

    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text;
    expect(text).toBeTruthy();
    const payload = JSON.parse(text!) as {
      candidates: Array<{ title: string; coverPreviewUrl: string | null }>;
    };
    expect(payload.candidates).toHaveLength(1);
    expect(payload.candidates[0]?.title).toBe("Foundation");
    expect(payload.candidates[0]?.coverPreviewUrl).toMatch(/covers\.openlibrary\.org/);
    expect(searchOpenLibraryCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ q: "foundation", limit: 5 }),
    );

    await transport.close();
  });

  test("callTool search_catalog returns validation error for invalid xor input", async () => {
    if (!dbAvailable) return;

    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      fetch: mcpFetch,
      requestInit: { headers: { Authorization: `Bearer ${apiToken}` } },
    });
    const client = new Client({ name: "shelf-route-test", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "search_catalog",
      arguments: { q: "foo", title: "bar" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("exactly one");

    await transport.close();
  });

  test("callTool search_catalog returns provider error when upstream fails", async () => {
    if (!dbAvailable) return;
    searchOpenLibraryCatalog.mockRejectedValueOnce(new Error("OpenLibrary error (500)"));

    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      fetch: mcpFetch,
      requestInit: { headers: { Authorization: `Bearer ${apiToken}` } },
    });
    const client = new Client({ name: "shelf-route-test", version: "0.0.0" });
    await client.connect(transport);

    const result = await client.callTool({
      name: "search_catalog",
      arguments: { q: "broken" },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toBe("Catalog provider unavailable");

    await transport.close();
  });
});
