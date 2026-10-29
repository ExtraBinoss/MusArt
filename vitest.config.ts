import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
const extensions = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const core = [`packages/core/test/**/*.test.${extensions}`];
// Native storage cloning and external animation clocks require a fresh Node realm.
const platform = [
  `apps/web/test/services/{animation,history,projects,session}/**/*.test.${extensions}`,
  "apps/web/test/components/animation/**/*.test.{ts,tsx}",
  "test/{audits,scripts}/**/*.test.{ts,tsx}",
  "apps/web/test/canvas/{viewport/use-viewport,render/plane-resources,artboards/use-previews}.test.ts",
  "apps/web/test/components/{projects/gallery/ProjectPreview,assets/{ShapeToolSlot,SearchInput},shared/{use-reset-feedback,NumberInput},search/open-timing,layers/rows/thumbnail-idle}.test.{ts,tsx}",
  "apps/web/test/services/{serialization/fragments/task-yield,serialization/hashing/client,files/download,selection/wand/client}.test.ts",
];
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) } },
  test: {
    globals: true,
    maxWorkers: 4,
    projects: [
      {
        test: {
          name: "core",
          environment: "node",
          pool: "threads",
          isolate: false,
          include: core,
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          pool: "vmThreads",
          vmMemoryLimit: "512MB",
          include: [
            `packages/*/test/**/*.test.${extensions}`,
            `apps/*/test/**/*.test.${extensions}`,
            `test/**/*.test.${extensions}`,
          ],
          exclude: [...core, ...platform],
          setupFiles: ["./test/setup.ts"],
        },
      },
      {
        test: {
          name: "platform",
          environment: "jsdom",
          pool: "threads",
          include: platform,
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
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
