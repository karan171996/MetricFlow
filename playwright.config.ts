import { defineConfig } from "@playwright/test";

// scripts/test-env.mjs starts the app on a free port and passes it as PLAYWRIGHT_BASE_URL.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  outputDir: "test-results/pw",
  workers: 1, // one shared server and timing-sensitive animation specs: no parallel files
  timeout: 60_000,
  expect: { timeout: 15_000 }, // the first page of a run is slow on a cold server
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1000, height: 660 }, // specs that need a wider screen set their own
    headless: !!process.env.CI, // a visible browser window locally, headless in CI
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
  },
});
