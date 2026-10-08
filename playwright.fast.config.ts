import { defineConfig, devices } from "@playwright/test";

import baseConfig from "./playwright.config";

// PR iteration needs a genuinely fast failure signal. The exhaustive Browser
// Audit remains the release gate, but replaying every viewport and route while
// known blockers are still present makes each repair cycle needlessly expensive.
//
// Importing the canonical config is intentional: its fail-closed local-Supabase
// assertions still execute here, so the fast path can never become an escape
// hatch to hosted/production Supabase.
export default defineConfig(baseConfig, {
  timeout: 2 * 60_000,
  retries: 0,
  workers: 3,
  reporter: process.env.CI
    ? [
        ["line"],
        ["json", { outputFile: "playwright-summary.json" }],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",
  projects: [
    {
      name: "organizer-admin-desktop",
      testMatch: /organizer-routes\.e2e\.ts/,
      grep: /every registered Organizer destination loads on desktop/,
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "organizer-admin-landscape",
      testMatch: /organizer-routes\.e2e\.ts/,
      grep: /critical Organizer work remains usable on mobile/,
      use: { viewport: { width: 844, height: 390 } },
    },
    {
      name: "ios-pwa-landscape",
      testMatch: /installed-app\.e2e\.ts/,
      grep: /cold launch preserves Results query, history semantics and post-restore persistence/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 844, height: 390 },
      },
    },
  ],
});
