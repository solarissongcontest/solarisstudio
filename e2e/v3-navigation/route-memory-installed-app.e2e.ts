import { expect, test, type BrowserContext } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

function localConfig() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  const missing = !supabaseUrl || !publishableKey || !email || !password;

  if (missing && process.env.CI) {
    throw new Error("V3 installed-app route-memory coverage requires the isolated local Supabase fixture.");
  }
  test.skip(missing, "Local V3 navigation browser fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Refusing V3 installed-app route-memory E2E against hosted Supabase: ${url.origin}`);
  }

  return {
    supabaseUrl: supabaseUrl!,
    publishableKey: publishableKey!,
    email: email!,
    password: password!,
    baseURL,
  };
}

async function signIn(): Promise<E2ESession> {
  const { supabaseUrl, publishableKey, email, password } = localConfig();
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
  const { supabaseUrl, baseURL } = localConfig();
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
    },
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
}

async function expectActiveTab(
  page: import("@playwright/test").Page,
  label: "Home" | "Explore" | "Participate" | "Results" | "Me",
) {
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveAttribute(
    "aria-label",
    new RegExp(`^${label}`),
  );
}

test.describe.configure({ retries: 0 });

test("installed app preserves remembered deep tab routes across keyboard navigation, Back, reload and resume", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS contract only");

  const session = await signIn();
  const { baseURL } = localConfig();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await installSession(context, session);
  const page = await context.newPage();

  // Seed a real nested Me destination through navigation, not by writing route
  // memory directly. This keeps the browser test on the same ownership path as
  // production users.
  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expectActiveTab(page, "Me");

  // Keyboard is a first-class navigation path. Leaving Me must retain the deep
  // route as that tab's remembered destination.
  const homeLink = page.locator("[data-v3-liquid-tabbar]").getByRole("link", {
    name: "Home",
    exact: true,
  });
  await homeLink.focus();
  await expect(homeLink).toBeFocused();
  await homeLink.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expectActiveTab(page, "Home");

  // Returning through the semantic Me tab should restore the remembered nested
  // route instead of collapsing to a generic root.
  await page
    .locator("[data-v3-liquid-tabbar]")
    .getByRole("link", { name: "Me", exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expectActiveTab(page, "Me");

  // Put another Home entry on the browser history stack, then prove native Back
  // returns to the exact remembered deep route with canonical tab identity.
  await page
    .locator("[data-v3-liquid-tabbar]")
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expectActiveTab(page, "Home");

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expectActiveTab(page, "Me");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expectActiveTab(page, "Me");

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("solaris:app-resume", {
        detail: { resumedAt: new Date().toISOString(), backgroundDurationMs: 2500 },
      }),
    );
  });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expectActiveTab(page, "Me");

  await context.close();
});
