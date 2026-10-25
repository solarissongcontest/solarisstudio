import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4177";

// The canonical promotion test must never inherit a hosted target from .env.
for (const [name, value] of Object.entries({
  E2E_BASE_URL: baseURL,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  E2E_SUPABASE_URL: process.env.E2E_SUPABASE_URL,
  VITE_CONFIRMATIONS_SUPABASE_URL: process.env.VITE_CONFIRMATIONS_SUPABASE_URL,
  CONFIRMATIONS_SUPABASE_URL: process.env.CONFIRMATIONS_SUPABASE_URL,
})) {
  let local = false;
  try {
    const url = new URL(value ?? "");
    local = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch { /* Missing or invalid endpoints fail closed below. */ }
  if (!local) throw new Error(`S14 promotion requires an explicit local ${name}`);
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: /v3-s14-grand-final-runtime\.e2e\.ts/,
  outputDir: "test-results/v3-s14-grand-final",
  timeout: 4 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["json", { outputFile: "playwright-s14-grand-final-summary.json" }]]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    // Reuse the server's existing loopback-only E2E maintenance access. This
    // cookie grants no account/Organizer permissions; normal auth still runs.
    storageState: {
      cookies: [{
        name: "solaris_e2e_maintenance_bypass",
        value: "1",
        domain: new URL(baseURL).hostname,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      }],
      origins: [],
    },
    baseURL,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    contextOptions: { reducedMotion: "reduce" },
    colorScheme: "dark",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4177 --strictPort",
        // Root intentionally serves 503 during global maintenance. A shipped
        // public asset proves server readiness without changing that policy.
        url: new URL("/assets/terraos-maintenance.css", baseURL).href,
        stdout: "pipe",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
