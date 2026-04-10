import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

/** Canonical origin for E2E; must match NEXTAUTH_URL on the spawned dev server. */
function resolvePlaywrightBaseUrl(): string {
  const raw = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3000";
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`Invalid PLAYWRIGHT_BASE_URL: ${raw}`);
  }
}

const baseURL = resolvePlaywrightBaseUrl();

const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? "e2e-dev-secret-placeholder-32chars!";

// CI always spawns a server with NEXTAUTH_URL === baseURL. Locally, reusing a running `pnpm dev`
// is faster; loopback origin normalization in login actions covers localhost vs 127.0.0.1. Set
// PLAYWRIGHT_NO_REUSE_SERVER=1 to always spawn (strict env parity with CI).
const reuseExistingServer =
  !(process.env.CI === "true" || process.env.CI === "1") &&
  process.env.PLAYWRIGHT_NO_REUSE_SERVER !== "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXTAUTH_URL: baseURL,
      NEXTAUTH_SECRET: nextAuthSecret,
      REGISTRATION_ENABLED: "true",
      STORAGE_TYPE: "local",
      STORAGE_PATH: process.env.E2E_STORAGE_PATH ?? ".data/e2e-library",
    },
  },
});
