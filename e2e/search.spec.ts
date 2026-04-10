import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

test.describe("Catalog (/search)", () => {
  test("catalog query input and page heading", async ({ page }) => {
    await loginAs(page, "e2e-reader@test.local");
    await page.goto("/search");

    await expect(page.getByRole("heading", { name: "Catalogue" })).toBeVisible();

    const query = page.getByTestId("catalog-search-query");
    await query.fill("foundation");
    await expect(query).toHaveValue("foundation");
  });
});
