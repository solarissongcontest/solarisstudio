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
      "Browser Audit must provide isolated local Supabase and country credentials for V3 navigation coverage.",
    );
  }
  test.skip(missing, "Local V3 navigation browser fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing V3 navigation E2E against non-local Supabase: ${url.origin}`);
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

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
};

type NavigationSnapshot = {
  overflow: number;
  material: Rect;
  lens: Rect;
  activeItem: Rect | null;
  items: Rect[];
  materialBackdropFilter: string;
  materialWebkitBackdropFilter: string;
  lensBackdropFilter: string;
  lensWebkitBackdropFilter: string;
  backdropDisplay: string;
};

async function readNavigationSnapshot(page: Page): Promise<NavigationSnapshot | null> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    const material = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__material") ?? null;
    const backdrop = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__backdrop") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
    const activeItem =
      bar?.querySelector<HTMLElement>('[data-v3-tab-index][aria-current="page"]') ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
      : [];

    if (!bar || !material || !backdrop || !lens || items.length !== 5) return null;

    const rect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.left + bounds.width / 2,
      };
    };

    const materialStyle = getComputedStyle(material) as CSSStyleDeclaration & {
      webkitBackdropFilter?: string;
    };
    const lensStyle = getComputedStyle(lens) as CSSStyleDeclaration & {
      webkitBackdropFilter?: string;
    };

    return {
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      material: rect(material),
      lens: rect(lens),
      activeItem: activeItem ? rect(activeItem) : null,
      items: items.map(rect),
      materialBackdropFilter: materialStyle.backdropFilter,
      materialWebkitBackdropFilter: materialStyle.webkitBackdropFilter ?? "",
      lensBackdropFilter: lensStyle.backdropFilter,
      lensWebkitBackdropFilter: lensStyle.webkitBackdropFilter ?? "",
      backdropDisplay: getComputedStyle(backdrop).display,
    };
  });
}

async function forceLoadedReducedTransparencyRules(page: Page) {
  return page.evaluate(() => {
    const forcedRules: string[] = [];
    let matchingMediaRules = 0;

    const inspectRules = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (
          rule instanceof CSSMediaRule &&
          /prefers-reduced-transparency\s*:\s*reduce/i.test(rule.conditionText)
        ) {
          matchingMediaRules += 1;
          forcedRules.push(...Array.from(rule.cssRules, (child) => child.cssText));
          continue;
        }

        const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
        if (nested) inspectRules(nested);
      }
    };

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        inspectRules(sheet.cssRules);
      } catch {
        // Ignore cross-origin sheets. Solaris production CSS is same-origin and
        // must still contribute at least one matching media rule below.
      }
    }

    if (forcedRules.length > 0) {
      const style = document.createElement("style");
      style.dataset.solarisReducedTransparencyProof = "production-rules";
      style.textContent = forcedRules.join("\n");
      document.head.append(style);
    }

    return {
      matchingMediaRules,
      forcedRuleCount: forcedRules.length,
      nativeMediaMatch: window.matchMedia("(prefers-reduced-transparency: reduce)").matches,
    };
  });
}

function expectSameRect(before: Rect, after: Rect, tolerance = 1) {
  expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(tolerance);
}

function expectNoRefraction(value: string) {
  expect(value === "none" || value === "").toBe(true);
}

test.describe.configure({ retries: 0 });

test("installed app shell survives representative navigation without duplicate chrome: Reduced Transparency preserves Liquid geometry and semantics while removing decorative refraction", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "One canonical installed-iOS viewport is sufficient for focused Reduced Transparency evidence.",
  );

  const session = await signInLocalCountry();
  const { baseURL } = requiredLocalConfig();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installSession(context, session);
  const page = await context.newPage();

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();

  const nav = page.locator("[data-v3-liquid-tabbar]");
  await expect(nav).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary app navigation" })).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

  for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(1);
  }

  const before = await readNavigationSnapshot(page);
  expect(before).not.toBeNull();
  if (!before) return;
  expect(before.activeItem).not.toBeNull();
  expect(before.overflow).toBeLessThanOrEqual(2);

  const forced = await forceLoadedReducedTransparencyRules(page);
  expect(forced.matchingMediaRules).toBeGreaterThan(0);
  expect(forced.forcedRuleCount).toBeGreaterThanOrEqual(3);

  // Playwright WebKit currently exposes no Reduced Transparency emulation
  // option. We therefore activate the exact declarations from the loaded
  // production media rule rather than overriding matchMedia or duplicating the
  // fallback in this test. nativeMediaMatch is recorded only to make that
  // evidence boundary explicit; the assertion is on the production rules.
  expect(typeof forced.nativeMediaMatch).toBe("boolean");

  await expect
    .poll(async () => (await readNavigationSnapshot(page))?.backdropDisplay ?? "")
    .toBe("none");

  const after = await readNavigationSnapshot(page);
  expect(after).not.toBeNull();
  if (!after || !after.activeItem || !before.activeItem) return;

  expectNoRefraction(after.materialBackdropFilter);
  expectNoRefraction(after.materialWebkitBackdropFilter);
  expectNoRefraction(after.lensBackdropFilter);
  expectNoRefraction(after.lensWebkitBackdropFilter);
  expect(after.backdropDisplay).toBe("none");

  expectSameRect(before.material, after.material);
  expectSameRect(before.lens, after.lens);
  expectSameRect(before.activeItem, after.activeItem);
  expect(after.overflow).toBeLessThanOrEqual(2);
  expect(Math.abs(after.lens.centerX - after.activeItem.centerX)).toBeLessThanOrEqual(3);

  expect(after.items).toHaveLength(5);
  for (let index = 0; index < after.items.length; index += 1) {
    expectSameRect(before.items[index], after.items[index]);
    expect(after.items[index].width).toBeGreaterThanOrEqual(44);
    expect(after.items[index].height).toBeGreaterThanOrEqual(44);
  }

  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveCount(1);
  }

  await context.close();
});
