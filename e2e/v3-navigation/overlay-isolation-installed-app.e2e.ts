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
    throw new Error(
      "V3 overlay-isolation evidence requires the isolated local Supabase fixture.",
    );
  }
  test.skip(missing, "Local V3 overlay-isolation fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(
      `Refusing V3 overlay-isolation E2E against hosted Supabase: ${url.origin}`,
    );
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

async function activeElementInsideLiquidNav(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    return Boolean(nav && document.activeElement && nav.contains(document.activeElement));
  });
}

test.describe.configure({ retries: 0 });

test("installed app shell survives representative navigation without duplicate chrome: keyboard and overlays isolate persistent navigation from focus and accessibility", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS contract only");

  const session = await signIn();
  const { baseURL } = localConfig();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installSession(context, session);
  const page = await context.newPage();

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();

  const nav = page.locator("[data-v3-liquid-tabbar]");
  const meLink = nav.getByRole("link", { name: "Me", exact: true });
  await expect(nav).toBeVisible();
  await meLink.focus();
  await expect(meLink).toBeFocused();
  expect(await activeElementInsideLiquidNav(page)).toBe(true);

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-solaris-keyboard-open", "true");
  });
  await expect(nav).toHaveAttribute("inert", "");
  await expect(nav).toHaveAttribute("aria-hidden", "true");
  await expect(nav).toHaveAttribute("data-solaris-overlay-nav-inert-owner", "overlay-manager");
  await expect(nav).toHaveAttribute("data-solaris-overlay-nav-aria-owner", "overlay-manager");
  await expect.poll(() => activeElementInsideLiquidNav(page)).toBe(false);

  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-solaris-keyboard-open");
  });
  await expect(nav).not.toHaveAttribute("inert", "");
  await expect(nav).not.toHaveAttribute("aria-hidden", "true");
  await expect(nav).not.toHaveAttribute("data-solaris-overlay-nav-inert-owner", /.+/);
  await expect(nav).not.toHaveAttribute("data-solaris-overlay-nav-aria-owner", /.+/);

  // Prove the manager does not erase ARIA state it did not own. This is a
  // deterministic ownership fixture, not production navigation configuration.
  await nav.evaluate((element) => element.setAttribute("aria-hidden", "false"));
  const homeLink = nav.getByRole("link", { name: "Home", exact: true });
  await homeLink.focus();
  await expect(homeLink).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-solaris-feature-overlay-open", "true");
  });
  await expect(nav).toHaveAttribute("inert", "");
  await expect(nav).toHaveAttribute("aria-hidden", "true");
  await expect(nav).toHaveAttribute("data-solaris-overlay-nav-aria-previous", "false");
  await expect.poll(() => activeElementInsideLiquidNav(page)).toBe(false);

  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-solaris-feature-overlay-open");
  });
  await expect(nav).not.toHaveAttribute("inert", "");
  await expect(nav).toHaveAttribute("aria-hidden", "false");
  await expect(nav).not.toHaveAttribute("data-solaris-overlay-nav-aria-previous", /.+/);

  await nav.evaluate((element) => element.removeAttribute("aria-hidden"));
  await context.close();
});
