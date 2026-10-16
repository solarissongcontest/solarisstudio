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
    throw new Error("V3 installed-app history coverage requires the isolated local Supabase fixture.");
  }
  test.skip(missing, "Local V3 navigation browser fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Refusing V3 installed-app history E2E against non-local Supabase: ${url.origin}`);
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
  expect(response.ok).toBeTruthy();
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

async function navGeometry(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const material = document.querySelector<HTMLElement>(".v3-liquid-tabbar__material");
    const items = Array.from(
      document.querySelectorAll<HTMLElement>("[data-v3-liquid-tabbar] [data-v3-tab-index]"),
    );
    if (!material) return null;
    const rect = material.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      targetMins: items.map((item) => {
        const itemRect = item.getBoundingClientRect();
        return Math.min(itemRect.width, itemRect.height);
      }),
    };
  });
}

test("installed app shell survives representative navigation without duplicate chrome: deep links, Back, resume and large text preserve canonical state", async ({
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

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveAttribute(
    "aria-label",
    /^Me/,
  );

  const beforeTextScale = await navGeometry(page);
  expect(beforeTextScale).not.toBeNull();
  if (!beforeTextScale) return;

  await page.evaluate(() => {
    document.body.style.fontSize = "200%";
  });
  const afterTextScale = await navGeometry(page);
  expect(afterTextScale).not.toBeNull();
  if (!afterTextScale) return;
  expect(Math.abs(afterTextScale.width - beforeTextScale.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(afterTextScale.height - beforeTextScale.height)).toBeLessThanOrEqual(1);
  expect(afterTextScale.overflow).toBeLessThanOrEqual(2);
  for (const target of afterTextScale.targetMins) expect(target).toBeGreaterThanOrEqual(44);

  // Keyboard is a first-class navigation path, not a fallback hidden behind
  // pointer gesture enhancement. Focus the semantic Home link and activate it
  // with Enter so the same route-memory test proves keyboard routing too.
  const homeLink = page.locator("[data-v3-liquid-tabbar]").getByRole("link", { name: "Home" });
  await homeLink.focus();
  await expect(homeLink).toBeFocused();
  await homeLink.press("Enter");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveAttribute(
    "aria-label",
    /^Home/,
  );

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveAttribute(
    "aria-label",
    /^Me/,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveAttribute(
    "aria-label",
    /^Me/,
  );

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("solaris:app-resume", {
        detail: { resumedAt: new Date().toISOString(), backgroundDurationMs: 2500 },
      }),
    );
  });
  await expect.poll(() => new URL(page.url()).pathname).toBe("/my-solaris/account");
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveAttribute(
    "aria-label",
    /^Me/,
  );

  await context.close();
});
