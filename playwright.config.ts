import { defineConfig, devices } from "@playwright/test";

import { GLOBAL_MAINTENANCE_MODE } from "./src/lib/maintenance";

const fullAudit = process.env.E2E_FULL_AUDIT === "1";
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
const personalityViewportMatrix = [
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
] as const;
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

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  outputDir: "test-results/playwright",
  timeout: process.env.CI ? 8 * 60_000 : 5 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
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
    baseURL,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    // Apply the device descriptor first. Some Playwright descriptors carry
    // optional media fields as undefined; placing it after reducedMotion can
    // silently erase the visual-test accessibility contract.
    ...devices["Desktop Chrome"],
    reducedMotion: "reduce",
    colorScheme: "dark",
    storageState: appAuditStorageState,
  },
  // CI starts and health-checks its server explicitly and passes E2E_BASE_URL.
  // For local runs, use Vite dev rather than Vite preview because the production
  // build targets Cloudflare and does not emit TanStack's Node preview bundle.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: GLOBAL_MAINTENANCE_MODE && !maintenanceAuditBypass ? maintenanceProjects : [
    ...(GLOBAL_MAINTENANCE_MODE ? maintenanceProjects : []),
    ...publicViewportMatrix.map(({ width, height }) => ({
      name: `public-${width}`,
      testMatch: /public-routes\.e2e\.ts/,
      use: { viewport: { width, height } },
    })),
    ...personalityViewportMatrix.map(({ width, height }) => ({
      name: `personality-${width}`,
      testMatch: /personality-contract\.e2e\.ts/,
      use: { viewport: { width, height } },
    })),
    {
      name: "personality-touch-390",
      testMatch: /personality-contract\.e2e\.ts/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
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
        browserName: "webkit",
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "visual-ios-390",
      testMatch: /app-visual-capture\.e2e\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "ios-pwa-narrow-320",
      testMatch: /installed-app\.e2e\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: "ios-pwa-portrait",
      testMatch: /installed-app\.e2e\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "ios-pwa-large-430",
      testMatch: /installed-app\.e2e\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 430, height: 932 },
      },
    },
    {
      name: "ios-pwa-landscape",
      testMatch: /installed-app\.e2e\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        viewport: { width: 844, height: 390 },
      },
    },
  ],
});
