import { expect, test, type Browser, type BrowserContext, type TestInfo } from "@playwright/test";

import { auditPage } from "./audit-helpers";

type OrganizerSession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type Viewport = { width: number; height: number };

function requireLocalBrowserConfig() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_ORGANIZER_EMAIL;
  const password = process.env.E2E_ORGANIZER_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

  if (!supabaseUrl || !publishableKey || !email || !password) {
    throw new Error(
      "PR455 organizer preflight requires the seeded local Organizer and local Supabase identity.",
    );
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(supabaseUrl)) {
    throw new Error(`Refusing PR455 organizer preflight against non-local Supabase: ${supabaseUrl}`);
  }
  if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(baseURL)) {
    throw new Error(`Refusing PR455 organizer preflight against non-local app URL: ${baseURL}`);
  }

  return { supabaseUrl, publishableKey, email, password, baseURL };
}

async function signInOrganizer(
  supabaseUrl: string,
  publishableKey: string,
  email: string,
  password: string,
): Promise<OrganizerSession> {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  const body = await response.text();
  expect(response.ok, `Seeded local Organizer must sign in: ${body}`).toBeTruthy();
  return JSON.parse(body) as OrganizerSession;
}

async function installReactStateUpdateDiagnostics(context: BrowserContext) {
  await context.addInitScript(() => {
    const originalError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const first = args[0];
      if (
        typeof first === "string" &&
        first.includes("Can't perform a React state update on a component that hasn't mounted yet")
      ) {
        const stack = new Error("React state-update diagnostic").stack ?? "stack unavailable";
        originalError(...args, `\nReact state-update diagnostic stack:\n${stack}`);
        return;
      }
      originalError(...args);
    };
  });
}

async function newOrganizerContext(
  browser: Browser,
  baseURL: string,
  supabaseUrl: string,
  session: OrganizerSession,
  viewport: Viewport,
) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

  await context.addCookies([
    {
      name: "solaris_e2e_maintenance_bypass",
      value: "1",
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
  await installReactStateUpdateDiagnostics(context);
  return context;
}

async function auditRoutes(
  browser: Browser,
  testInfo: TestInfo,
  config: ReturnType<typeof requireLocalBrowserConfig>,
  session: OrganizerSession,
  label: string,
  viewport: Viewport,
  paths: readonly string[],
) {
  const context = await newOrganizerContext(
    browser,
    config.baseURL,
    config.supabaseUrl,
    session,
    viewport,
  );
  try {
    const page = await context.newPage();
    for (const path of paths) {
      await test.step(`${label}: ${path}`, () => auditPage(page, path, testInfo));
    }
  } finally {
    await context.close();
  }
}

test("PR455 organizer regression preflight", async ({ browser }, testInfo) => {
  const config = requireLocalBrowserConfig();
  const session = await signInOrganizer(
    config.supabaseUrl,
    config.publishableKey,
    config.email,
    config.password,
  );

  await auditRoutes(
    browser,
    testInfo,
    config,
    session,
    "desktop",
    { width: 1440, height: 1000 },
    ["/admin/hosts", "/televoting/admin/integrity-declarations"],
  );
  await auditRoutes(
    browser,
    testInfo,
    config,
    session,
    "mobile",
    { width: 390, height: 844 },
    ["/admin/entries/ssc22", "/admin/results-reveal"],
  );
  await auditRoutes(
    browser,
    testInfo,
    config,
    session,
    "landscape",
    { width: 844, height: 390 },
    ["/admin/results-reveal"],
  );
});
