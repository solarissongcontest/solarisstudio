import { defineConfig, devices } from "@playwright/test";

const widths = [360, 390, 430, 768, 1024, 1280, 1440, 1680, 1920] as const;
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  outputDir: "test-results/playwright",
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    reducedMotion: "reduce",
    colorScheme: "dark",
    ...devices["Desktop Chrome"],
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run preview --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    ...widths.map((width) => ({
      name: `public-${width}`,
      testMatch: /public-routes\.e2e\.ts/,
      use: { viewport: { width, height: width < 768 ? 844 : 1000 } },
    })),
    {
      name: "account-states",
      testMatch: /account-states\.e2e\.ts/,
      use: { viewport: { width: 1440, height: 1000 } },
    },
  ],
});
