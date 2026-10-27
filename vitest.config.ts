import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    globals: true,
    maxWorkers: 4,
    include: [
      "packages/*/test/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
      "apps/*/test/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
      "test/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
    ],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "packages/*/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
        "apps/*/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
      ],
      exclude: ["**/*.d.ts", "**/*.d.mts", "**/*.d.cts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
        "packages/core/src/**": { lines: 85, functions: 85, branches: 85, statements: 85 },
      },
    },
  },
});
