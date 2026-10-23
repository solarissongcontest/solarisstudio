import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4178";
// The S14 config owns a loopback-only app server when E2E_BASE_URL is absent.
// That local runtime is allowed through maintenance so Playwright can exercise
// the real Organizer UI; custom/external servers still require an explicit opt-in.
const maintenanceAuditBypass =
  !process.env.E2E_BASE_URL || process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1";
const appAuditStorageState = maintenanceAuditBypass
  ? {
      cookies: [
        {
          name: "solaris_e2e_maintenance_bypass",
          value: "1",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /v3-s14-grand-final-results-runtime\.e2e\.ts/,
  outputDir: "test-results/v3-s14-grand-final-results",
  timeout: 4 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["json", { outputFile: "playwright-s14-grand-final-results-summary.json" }]]
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
    storageState: appAuditStorageState,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4178 --strictPort",
        // Maintenance deliberately returns 503 for `/`. Probe a static asset
        // instead so server readiness is not confused with app authorization.
        url: "http://127.0.0.1:4178/favicon.ico",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
