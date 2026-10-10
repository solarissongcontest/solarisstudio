import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /pr455-organizer-regression\.e2e\.ts/,
  outputDir: "test-results/pr455-preflight",
  timeout: process.env.CI ? 4 * 60_000 : 3 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["line"],
        ["json", { outputFile: "playwright-pr455-preflight-summary.json" }],
      ]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    navigationTimeout: 45_000,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    reducedMotion: "reduce",
    colorScheme: "dark",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
