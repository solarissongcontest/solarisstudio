import { defineConfig, devices } from "@playwright/test";

import { GLOBAL_MAINTENANCE_MODE } from "./src/lib/maintenance";

const REQUIRED_TEST_SUPABASE_URL_VARS = [
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "E2E_SUPABASE_URL",
  "VITE_CONFIRMATIONS_SUPABASE_URL",
  "CONFIRMATIONS_SUPABASE_URL",
] as const;

function isLoopbackUrl(value: string) {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function assertPlaywrightSupabaseIsolation() {
  for (const name of REQUIRED_TEST_SUPABASE_URL_VARS) {
    const value = process.env[name];
    if (!value) {
      throw new Error(
        `[Playwright safety] Missing ${name}. Automated browser tests require explicit local Supabase configuration and never fall back to .env/production.`,
      );
    }
    if (!isLoopbackUrl(value)) {
      throw new Error(
        `[Playwright safety] Refusing non-local Supabase endpoint in ${name}: ${value}`,
      );
    }
  }

  for (const [name, value] of Object.entries(process.env)) {
    if (!value || !/SUPABASE.*URL/i.test(name)) continue;
    if (!isLoopbackUrl(value)) {
      throw new Error(
        `[Playwright safety] Refusing hosted/non-loopback Supabase URL from ${name}: ${value}`,
      );
    }
  }
}

assertPlaywrightSupabaseIsolation();

const fullAuditRequested = process.env.E2E_FULL_AUDIT === "1";
const routineMainPush =
  Boolean(process.env.CI) &&
  process.env.GITHUB_EVENT_NAME === "push" &&
  process.env.GITHUB_REF === "refs/heads/main";
const fullAudit = fullAuditRequested && !routineMainPush;
const representativeCI =
  Boolean(process.env.CI) &&
  !fullAudit &&
  (process.env.GITHUB_EVENT_NAME === "pull_request" || routineMainPush);
const publicViewportMatrix = fullAudit
  ? ([
      { width: 320, height: 568 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 820, height: 1180 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ] as const)
  : ([
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 390, height: 844 },
      { width: 412, height: 915 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ] as const);
const personalityViewportMatrix = fullAudit
  ? ([
      { width: 320, height: 568 },
      { width: 360, height: 800 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ] as const)
  : ([
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ] as const);
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const maintenanceAuditBypass = process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1";
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

const maintenanceProjects = [
  {
    name: "maintenance-mobile-390",
    testMatch: /maintenance\.e2e\.ts/,
    use: { viewport: { width: 390, height: 844 }, storageState: { cookies: [], origins: [] } },
  },
  {
    name: "maintenance-desktop-1440",
    testMatch: /maintenance\.e2e\.ts/,
    use: { viewport: { width: 1440, height: 900 }, storageState: { cookies: [], origins: [] } },
  },
];

const publicProjects = publicViewportMatrix.map(({ width, height }) => ({
  name: `public-${width}`,
  testMatch: /public-routes\.e2e\.ts/,
  use: { viewport: { width, height } },
}));

const personalityProjects = personalityViewportMatrix.map(({ width, height }) => ({
  name: `personality-${width}`,
  testMatch: /personality-contract\.e2e\.ts/,
  use: { viewport: { width, height }, serviceWorkers: "block" as const },
}));

const representativeCiProjects = [
  {
    name: "public-390",
    testMatch: /public-routes\.e2e\.ts/,
    use: { viewport: { width: 390, height: 844 } },
  },
  {
    name: "public-1440",
    testMatch: /public-routes\.e2e\.ts/,
    use: { viewport: { width: 1440, height: 900 } },
  },
  {
    // Keep the exact loading/failure/fallback regression that this PR exposed.
    // The exhaustive gallery and reference-lock capture remain in fullAudit.
    name: "personality-390",
    testMatch: /personality-contract\.e2e\.ts/,
    grep: /flag loading, failure and fallback states are deterministic/,
    use: { viewport: { width: 390, height: 844 }, serviceWorkers: "block" as const },
  },
  {
    // Account/read-only states are release-critical for PR #464.
    name: "account-states",
    testMatch: /account-states\.e2e\.ts/,
    use: { viewport: { width: 1440, height: 1000 } },
  },
  {
    // One installed-app shell path proves the mobile chrome without running the
    // exhaustive PWA launch/geometry certification suite on every pull request.
    name: "ios-pwa-portrait",
    testMatch: /installed-app\.e2e\.ts/,
    grep: /installed app shell survives representative navigation without duplicate chrome/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce" as const,
    },
  },
];

const exhaustiveProjects = [
  ...publicProjects,
  ...personalityProjects,
  {
    name: "personality-touch-390",
    testMatch: /personality-contract\.e2e\.ts/,
    use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" as const },
  },
  {
    name: "governance-mobile-390",
    testMatch: /governance\.e2e\.ts/,
    use: { viewport: { width: 390, height: 844 } },
  },
  {
    name: "governance-tablet-768",
    testMatch: /governance\.e2e\.ts/,
    use: { viewport: { width: 768, height: 1024 } },
  },
  {
    name: "governance-desktop-1440",
    testMatch: /governance\.e2e\.ts/,
    use: { viewport: { width: 1440, height: 1000 } },
  },
  {
    name: "account-states",
    testMatch: /account-states\.e2e\.ts/,
    use: { viewport: { width: 1440, height: 1000 } },
  },
  {
    name: "admin-notifications-postgrest",
    testMatch: /admin-notifications-postgrest\.e2e\.ts/,
    use: { viewport: { width: 390, height: 844 } },
  },
  {
    name: "organizer-admin-desktop",
    testMatch: /organizer-routes\.e2e\.ts/,
    use: { viewport: { width: 1440, height: 1000 } },
  },
  {
    name: "organizer-admin-mobile",
    testMatch: /organizer-routes\.e2e\.ts/,
    use: { viewport: { width: 390, height: 844 } },
  },
  {
    name: "organizer-admin-landscape",
    testMatch: /organizer-routes\.e2e\.ts/,
    use: { viewport: { width: 844, height: 390 } },
  },
  {
    name: "visual-ios-320",
    testMatch: /app-visual-capture\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce" as const,
    },
  },
  {
    name: "visual-ios-390",
    testMatch: /app-visual-capture\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce" as const,
    },
  },
  {
    name: "ios-pwa-narrow-320",
    testMatch: /installed-app\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 320, height: 568 },
      reducedMotion: "reduce" as const,
    },
  },
  {
    name: "ios-pwa-portrait",
    testMatch: /installed-app\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce" as const,
    },
  },
  {
    name: "ios-pwa-large-430",
    testMatch: /installed-app\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 430, height: 932 },
      reducedMotion: "reduce" as const,
    },
  },
  {
    name: "ios-pwa-landscape",
    testMatch: /installed-app\.e2e\.ts/,
    use: {
      ...devices["iPhone 13"],
      browserName: "webkit" as const,
      viewport: { width: 844, height: 390 },
      reducedMotion: "reduce" as const,
    },
  },
];

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  globalSetup: process.env.CI ? "./e2e/pr455-browser-preflight.global.ts" : undefined,
  grepInvert: fullAudit ? undefined : /installed-app route invariant crawl/,
  outputDir: "test-results/playwright",
  // Routine PR and main-push CI is release feedback, not an exhaustive crawler.
  // The broad inventory stays available for explicit/manual and release-branch
  // certification; routine CI runs a deterministic representative matrix after
  // the separate Organizer fail-fast preflight.
  timeout: representativeCI ? 90_000 : process.env.CI ? 8 * 60_000 : 5 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: representativeCI ? 0 : process.env.CI ? 1 : 0,
  // The representative CI matrix is already bounded. Do not stop after the first
  // failure: one run must report the whole actionable browser failure set.
  maxFailures: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI
    ? fullAudit
      ? [
          ["line"],
          ["html", { outputFolder: "playwright-report", open: "never" }],
        ]
      : [
          ["line"],
          ["json", { outputFile: "playwright-summary.json" }],
          ["html", { outputFolder: "playwright-report", open: "never" }],
        ]
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
        command: "bun run dev --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: GLOBAL_MAINTENANCE_MODE && !maintenanceAuditBypass
    ? maintenanceProjects
    : [
        ...(GLOBAL_MAINTENANCE_MODE ? maintenanceProjects : []),
        ...(representativeCI ? representativeCiProjects : exhaustiveProjects),
      ],
});
