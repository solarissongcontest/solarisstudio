import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

function config() {
  const supabaseUrl = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
  const missing = !supabaseUrl || !publishableKey || !email || !password;

  if (missing && process.env.CI) {
    throw new Error("V3 large-text navigation evidence requires the isolated local Supabase fixture.");
  }
  test.skip(missing, "Local V3 large-text navigation fixture is unavailable");

  const parsed = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new Error(`Refusing V3 large-text evidence against hosted Supabase: ${parsed.origin}`);
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
  const { supabaseUrl, publishableKey, email, password } = config();
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
  const { supabaseUrl, baseURL } = config();
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
      const original = window.matchMedia.bind(window);
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
        return original(query);
      }) as typeof window.matchMedia;
    },
    { key: `sb-${projectRef}-auth-token`, value: session },
  );
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    const material = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__material") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
    const active = bar?.querySelector<HTMLElement>('[data-v3-tab-index][aria-current="page"]') ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
      : [];
    if (!bar || !material || !lens || !active || items.length !== 5) return null;

    const rect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.left + bounds.width / 2,
      };
    };

    return {
      viewportWidth: window.innerWidth,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      bar: rect(bar),
      material: rect(material),
      lens: rect(lens),
      active: rect(active),
      items: items.map(rect),
    };
  });
}

function expectAccessibleGeometry(value: NonNullable<Awaited<ReturnType<typeof geometry>>>) {
  expect(value.overflow).toBeLessThanOrEqual(2);
  expect(value.bar.left).toBeGreaterThanOrEqual(-1);
  expect(value.bar.right).toBeLessThanOrEqual(value.viewportWidth + 1);
  expect(Math.abs(value.lens.centerX - value.active.centerX)).toBeLessThanOrEqual(3);
  for (const item of value.items) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe.configure({ retries: 0 });

test("installed app shell survives representative navigation without duplicate chrome: 200% text scale preserves Liquid physical geometry", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS viewport only");

  const session = await signIn();
  const { baseURL } = config();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  await installSession(context, session);
  const page = await context.newPage();

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  const nav = page.locator("[data-v3-liquid-tabbar]");
  await expect(nav).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary app navigation" })).toHaveCount(1);

  const baseline = await geometry(page);
  expect(baseline).not.toBeNull();
  if (!baseline) return;
  expectAccessibleGeometry(baseline);

  // This is a deterministic browser regression for the CSS-pixel navigation
  // contract, not a substitute for real-device iOS Dynamic Type certification.
  // Page typography doubles through rem inheritance; the icon-only navigation
  // object must keep its physical dimensions, semantic names and 44px targets.
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect.poll(async () => (await geometry(page))?.rootFontSize ?? "").not.toBe(baseline.rootFontSize);

  const scaled = await geometry(page);
  expect(scaled).not.toBeNull();
  if (!scaled) return;
  expectAccessibleGeometry(scaled);

  expect(Math.abs(scaled.material.width - baseline.material.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(scaled.material.height - baseline.material.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(scaled.lens.width - baseline.lens.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(scaled.lens.height - baseline.lens.height)).toBeLessThanOrEqual(1);

  for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(1);
  }

  await context.close();
});
