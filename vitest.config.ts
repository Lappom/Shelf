import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Integration tests share one DATABASE_URL; parallel files cause FK races on cleanup.
    fileParallelism: false,
    environment: "node",
    setupFiles: ["./vitest.setup.dom.ts"],
    include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
    exclude: [
      "**/node_modules/**",
      "**/e2e/**",
      "**/.next/**",
      "**/*.component.test.tsx",
    ],
  },
});
