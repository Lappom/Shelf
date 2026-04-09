import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Component tests only (CLI glob filter is unreliable on Windows + Vitest 4). */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.dom.ts"],
    include: ["**/*.component.test.tsx"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/.next/**"],
  },
});
