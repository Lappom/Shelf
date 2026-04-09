import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

test.describe("Auth", () => {
  test("login with seeded reader", async ({ page }) => {
    await loginAs(page, "e2e-reader@test.local");
    await expect(page.getByRole("heading", { name: "Bibliothèque" })).toBeVisible();
  });

  test("register new account when registration is enabled", async ({ page }) => {
    await page.goto("/register");
    const disabled = page.getByText("Les inscriptions sont désactivées");
    if (await disabled.isVisible()) {
      test.skip();
    }
    const suffix = Date.now();
    const email = `e2e-register-${suffix}@test.local`;
    await page.locator("#email").fill(email);
    await page.locator("#username").fill(`e2e_reg_${suffix}`);
    await page.locator("#password").fill("E2ESecurePass!123");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page).toHaveURL(/\/library/, { timeout: 30_000 });
  });
});
