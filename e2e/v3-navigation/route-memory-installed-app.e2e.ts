import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type RememberedNavigation = {
  activeTab?: string;
  tabs?: Record<string, { current?: { pathname?: string; searchStr?: string }; history?: Array<{ pathname?: string; searchStr?: string }> }>;
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
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing V3 installed-app route-memory E2E against non-local Supabase: ${url.origin}`);
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
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        value: true,
      });
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

async function readRememberedNavigation(page: Page): Promise<RememberedNavigation | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("solaris:app-navigation:v1");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RememberedNavigation;
    } catch {
      return null;
    }
  });
}

async function expectRememberedLocation(page: Page, tab: "home" | "me", pathname: string) {
  await expect
    .poll(async () => {
      const state = await readRememberedNavigation(page);
      return {
        activeTab: state?.activeTab ?? null,
        currentPath: state?.tabs?.[tab]?.current?.pathname ?? null,
      };
    })
    .toEqual({ activeTab: tab, currentPath: pathname });
}

async function expectSelectedTab(page: Page, label: "Home" | "Me") {
  const nav = page.locator("[data-v3-liquid-tabbar]");
  await expect(nav).toBeVisible();
  await expect(nav.locator('[data-v3-tab-index][aria-current="page"]')).toHaveAttribute(
    "aria-label",
    new RegExp(`^${label}(?:,|$)`),
  );
}

test.describe.configure({ retries: 0 });

test("installed app preserves authenticated route memory across keyboard navigation, Back, reload and resume", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS route-memory contract only");

  const session = await signIn();
  const { baseURL } = localConfig();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await installSession(context, session);
  const page = await context.newPage();

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expectSelectedTab(page, "Me");
  await expectRememberedLocation(page, "me", "/my-solaris/account");

  // Keyboard activation must travel through the same semantic route path as a
  // pointer click and update the canonical top-level memory.
  const homeLink = page.locator("[data-v3-liquid-tabbar]").getByRole("link", {
    name: "Home",
    exact: true,
  });
  await homeLink.focus();
  await expect(homeLink).toBeFocused();
  await homeLink.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expectSelectedTab(page, "Home");
  await expectRememberedLocation(page, "home", "/");

  // Browser Back must restore the deep Me destination rather than collapsing
  // to the tab root or leaving Liquid selection on Home.
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expectSelectedTab(page, "Me");
  await expectRememberedLocation(page, "me", "/my-solaris/account");

  // A document reload must preserve the same canonical deep-link ownership.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expectSelectedTab(page, "Me");
  await expectRememberedLocation(page, "me", "/my-solaris/account");

  // Resume invalidates transient gesture state, but must not discard committed
  // route memory or move the user to a tab root.
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("solaris:app-resume", {
        detail: { resumedAt: new Date().toISOString(), backgroundDurationMs: 2500 },
      }),
    );
  });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expectSelectedTab(page, "Me");
  await expectRememberedLocation(page, "me", "/my-solaris/account");

  const remembered = await readRememberedNavigation(page);
  const meHistory = remembered?.tabs?.me?.history ?? [];
  expect(meHistory.some((entry) => entry.pathname === "/my-solaris/account")).toBe(true);

  await context.close();
});
