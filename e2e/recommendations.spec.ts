import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

test.describe("Recommendations", () => {
  test("carousel shows seeded title and dismiss hides it", async ({ page }) => {
    await loginAs(page, "e2e-reader@test.local");

    await expect(page.getByRole("heading", { name: "Pour vous" })).toBeVisible();
    await expect(page.getByText("E2E Recommendation Target")).toBeVisible();

    await page.getByTestId("reco-dismiss").click();

    await expect(page.getByText("E2E Recommendation Target")).not.toBeVisible();
  });
});
