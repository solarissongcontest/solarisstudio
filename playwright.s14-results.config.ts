import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4176";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /v3-s14-results-runtime\.e2e\.ts/,
  outputDir: "test-results/v3-s14-results",
  timeout: 4 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["json", { outputFile: "playwright-s14-results-summary.json" }]]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    reducedMotion: "reduce",
    colorScheme: "dark",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4176 --strictPort",
        url: "http://127.0.0.1:4176",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
