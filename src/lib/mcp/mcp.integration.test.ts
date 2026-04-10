import { describe, expect, test, beforeAll, afterAll, beforeEach } from "vitest";

import { generateApiKeyMaterial } from "@/lib/apiKeys/crypto";
import { resolveApiKeyUser } from "@/lib/apiKeys/resolveApiKeyUser";
import { prisma } from "@/lib/db/prisma";
import { assertIntegrationDatabaseOrThrow } from "@/lib/db/integrationDb";

let dbAvailable = false;

describe("MCP API key (integration)", () => {
  beforeAll(async () => {
    dbAvailable = await assertIntegrationDatabaseOrThrow();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.apiKey.deleteMany({ where: { user: { email: "mcp_key@test.local" } } });
    await prisma.user.deleteMany({ where: { email: "mcp_key@test.local" } });
  });

  test("resolveApiKeyUser matches stored hash and returns role", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: {
        email: "mcp_key@test.local",
        username: "mcp_key_user",
        role: "admin",
      },
      select: { id: true },
    });

    const { token, hash, prefix } = generateApiKeyMaterial();
    await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: "integration",
        hash,
        prefix,
      },
    });

    const resolved = await resolveApiKeyUser(token);
    expect(resolved?.userId).toBe(user.id);
    expect(resolved?.role).toBe("admin");
    expect(resolved?.apiKeyId).toBeTruthy();
    expect(resolved?.scopes).toBeNull();
  });

  test("resolveApiKeyUser returns stored scopes when set", async () => {
    if (!dbAvailable) return;

    const user = await prisma.user.create({
      data: {
        email: "mcp_key_scoped@test.local",
        username: "mcp_key_scoped",
        role: "reader",
      },
      select: { id: true },
    });

    const { token, hash, prefix } = generateApiKeyMaterial();
    await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: "scoped",
        hash,
        prefix,
        scopes: ["mcp:library:read", "mcp:catalog:read"],
      },
    });

    const resolved = await resolveApiKeyUser(token);
    expect(resolved?.scopes?.sort()).toEqual(["mcp:catalog:read", "mcp:library:read"].sort());

    await prisma.apiKey.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});
