import { test } from "@playwright/test";

test.describe("OIDC", () => {
  test.skip(true, "OIDC E2E requires OIDC_ISSUER + test IdP (configure env to enable)");
});
