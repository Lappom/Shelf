import { prisma } from "@/lib/db/prisma";

/**
 * Returns true if Prisma can reach the configured database.
 */
export async function isIntegrationDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1;`;
    return true;
  } catch {
    return false;
  }
}

/**
 * When SHELF_REQUIRE_TEST_DB=1 or CI=true, integration tests must not silently skip
 * if the database is down.
 */
export function integrationDatabaseRequired(): boolean {
  return process.env.SHELF_REQUIRE_TEST_DB === "1" || process.env.CI === "true";
}

/**
 * Use at the start of integration describe blocks: throws if DB is required but down.
 */
export async function assertIntegrationDatabaseOrThrow(): Promise<boolean> {
  const ok = await isIntegrationDatabaseReachable();
  if (!ok && integrationDatabaseRequired()) {
    throw new Error(
      "Integration database unreachable but SHELF_REQUIRE_TEST_DB=1 or CI=true. " +
        "Set DATABASE_URL (see .env.test.example) and run migrations.",
    );
  }
  return ok;
}
