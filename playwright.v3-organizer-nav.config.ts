import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

// Importing the canonical config executes its explicit loopback-only Supabase
// checks. An isolated Organizer test must also never visit a hosted website,
// whose production JavaScript could otherwise call hosted services.
const localBase = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const baseHost = new URL(localBase).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseHost)) {
  throw new Error("V3 Organizer navigation audit requires a local website URL");
}

/**
 * Explicit, single-worker NAV certification only. The test writes local
 * rollout flags, so never put it into the ordinary parallel Browser Audit
 * project matrix where other files may share the same local root cohort.
 *
 * Run after seeding the isolated local Supabase fixture:
 *   bunx playwright test --config=playwright.v3-organizer-nav.config.ts
 */
export default defineConfig({
  ...baseConfig,
  testMatch: /v3-organizer\.e2e\.ts/,
  outputDir: "test-results/v3-organizer-nav",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [{
    name: "ios-pwa-portrait",
    testMatch: /v3-organizer\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce" as const,
    },
  }],
});
