import type { Page } from "@playwright/test";

const DEFAULT_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "E2ESecurePass!123";

export async function loginAs(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/library/, { timeout: 30_000 });
}
