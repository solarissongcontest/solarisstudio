import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type LayoutDirection = "ltr" | "rtl";
type ProbeLabel = "Home" | "Participate" | "Me";

function localConfig() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  const missing = !supabaseUrl || !publishableKey || !email || !password;

  if (missing && process.env.CI) {
    throw new Error("V3 RTL lens coverage requires the isolated local Supabase fixture.");
  }
  test.skip(missing, "Local V3 navigation browser fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Refusing V3 RTL lens E2E against non-local Supabase: ${url.origin}`);
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

async function selectedLensDelta(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    const lens = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
    const active =
      bar?.querySelector<HTMLElement>('[data-v3-tab-index][aria-current="page"]') ?? null;
    if (!bar || !lens || !active) return Number.POSITIVE_INFINITY;

    const lensRect = lens.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    return Math.abs(
      lensRect.left + lensRect.width / 2 - (activeRect.left + activeRect.width / 2),
    );
  });
}

async function assertSelectedLens(
  page: Page,
  direction: LayoutDirection,
  label: ProbeLabel,
) {
  const nav = page.locator("[data-v3-liquid-tabbar]");
  const active = nav.locator('[data-v3-tab-index][aria-current="page"]');
  if ((await active.getAttribute("aria-label")) !== label) {
    await nav.getByRole("link", { name: label, exact: true }).click();
  }

  await expect(nav).toHaveAttribute("data-layout-direction", direction);
  await expect(active).toHaveAttribute("aria-label", new RegExp(`^${label}`));
  await expect.poll(() => selectedLensDelta(page)).toBeLessThanOrEqual(3);
}

test.describe.configure({ retries: 0 });

test("selected Liquid Glass lens stays physically aligned on first, middle and last tabs in LTR and RTL", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-WebKit geometry contract only");

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
  await expect(page.locator("[data-v3-liquid-tabbar]")).toBeVisible();

  for (const label of ["Home", "Participate", "Me"] as const) {
    await assertSelectedLens(page, "ltr", label);
  }

  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute(
    "data-layout-direction",
    "rtl",
  );

  for (const label of ["Home", "Participate", "Me"] as const) {
    await assertSelectedLens(page, "rtl", label);
  }

  await context.close();
});