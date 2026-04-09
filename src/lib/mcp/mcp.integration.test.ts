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
  });
});
