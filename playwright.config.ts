import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ?? "e2e-dev-secret-placeholder-32chars!";

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
    reuseExistingServer: !process.env.CI,
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
