import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test di integrazione: richiedono Supabase locale avviato (`npm run db:start`).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/support/load-env.ts"],
    // I test condividono lo stesso database locale: niente parallelismo tra file.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
