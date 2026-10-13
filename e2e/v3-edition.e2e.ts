import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

function requiredLocalConfig() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  const missing = !supabaseUrl || !publishableKey || !email || !password;

  if (missing && process.env.CI) {
    throw new Error(
      "Browser Audit must provide isolated local Supabase and country credentials for V3 Edition coverage.",
    );
  }
  test.skip(missing, "Local V3 Edition browser fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing V3 Edition E2E against non-local Supabase: ${url.origin}`);
  }

  return {
    supabaseUrl: supabaseUrl!,
    publishableKey: publishableKey!,
    email: email!,
    password: password!,
    baseURL,
  };
}

async function signInLocalCountry(): Promise<E2ESession> {
  const { supabaseUrl, publishableKey, email, password } = requiredLocalConfig();
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  expect(response.ok, "The isolated local country account must sign in").toBeTruthy();
  return (await response.json()) as E2ESession;
}

async function installSession(context: BrowserContext, session: E2ESession) {
  const { supabaseUrl, baseURL } = requiredLocalConfig();
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
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem("solaris:app-first-run-complete:v1", "1");
    },
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
}

async function enableInstalledMode(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return originalMatchMedia(query);
    }) as typeof window.matchMedia;
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

test.describe.configure({ retries: 0 });

test("V3 Edition owns the clean installed-app hub while canonical deep detail stays legacy", async ({ browser }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "One canonical installed-iOS viewport is sufficient for this bounded Edition cutover regression.",
  );

  const session = await signInLocalCountry();
  const { baseURL } = requiredLocalConfig();

  const installed = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installSession(installed, session);
  const appPage = await installed.newPage();
  await enableInstalledMode(appPage);

  await appPage.goto(`${baseURL}/editions/ssc22`, { waitUntil: "domcontentloaded" });
  await expect(appPage.getByRole("heading", { name: "Browser Audit Edition" })).toBeVisible();
  await expect(appPage.getByText("Explore this edition", { exact: true })).toBeVisible();
  await expect(
    appPage.getByText("Results remain locked until official publication", { exact: true }),
  ).toBeVisible();
  await expect(appPage.getByText("Available after official publication", { exact: true })).toBeVisible();
  await expect(appPage.locator(".edition-public-page")).toHaveCount(0);
  await expectNoHorizontalOverflow(appPage);

  await appPage.getByRole("link", { name: /Overview/ }).click();
  await expect(appPage).toHaveURL(/\/editions\/ssc22#edition-overview$/);
  await expect(appPage.locator("#edition-overview")).toBeVisible();
  await expect(appPage.locator(".edition-public-page")).toBeVisible();
  await expectNoHorizontalOverflow(appPage);

  const web = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installSession(web, session);
  const webPage = await web.newPage();
  await webPage.goto(`${baseURL}/editions/ssc22`, { waitUntil: "domcontentloaded" });
  await expect(webPage.locator(".edition-public-page")).toBeVisible();
  await expect(webPage.getByText("Explore this edition", { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(webPage);

  await installed.close();
  await web.close();
});
