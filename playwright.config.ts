import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 12000 },
  outputDir: "artifacts/browser",
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--enable-unsafe-swiftshader",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1600, height: 1000 } },
    },
  ],
  webServer: {
    command: "bun run build && bun run preview --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
