import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

test.describe("Search", () => {
  test("FTS query input, sort controls, and results area", async ({ page }) => {
    await loginAs(page, "e2e-reader@test.local");
    await page.goto("/search");

    await expect(page.getByRole("heading", { name: "Recherche" })).toBeVisible();

    const query = page.getByTestId("search-query");
    await query.fill("E2E Recommendation Target");
    await expect(query).toHaveValue("E2E Recommendation Target");

    await page.getByLabel("Tri").selectOption("title");
    await page.getByLabel("Sens du tri").selectOption("asc");

    await expect(page.getByLabel("Mode de requête")).toBeVisible();
    await expect(page.getByLabel("Livres par page")).toBeVisible();
  });
});
