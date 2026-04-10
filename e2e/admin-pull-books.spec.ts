import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

test.describe("Admin pull-books jobs", () => {
  test("create dry-run job and view status", async ({ page }) => {
    await loginAs(page, "e2e-admin@test.local");
    await page.goto("/admin/pull-books");

    await expect(
      page.getByRole("heading", { name: "Pull catalogue (Open Library)" }),
    ).toBeVisible();

    await page.locator("#pull-query").fill("history");
    await page.getByRole("checkbox", { name: "Dry-run (aucune écriture)" }).check();
    await page.getByRole("button", { name: "Créer un job de pull" }).click();

    await expect(page.getByRole("button", { name: "Détail" }).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
