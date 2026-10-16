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

async function readGeometry(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    const material = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__material") ?? null;
    const backdrop = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__backdrop") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
      : [];
    if (!bar || !material || !backdrop || !lens || items.length === 0) return null;

    const rect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };

    const rootStyle = getComputedStyle(document.documentElement);
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      collapsed: bar.getAttribute("data-collapsed") === "true",
      bar: rect(bar),
      material: rect(material),
      backdrop: rect(backdrop),
      lens: rect(lens),
      items: items.map(rect),
      obstruction: Number.parseFloat(
        rootStyle.getPropertyValue("--v3-bottom-obstruction") || "0",
      ),
      opacity: getComputedStyle(bar).opacity,
      pointerEvents: getComputedStyle(bar).pointerEvents,
    };
  });
}

test.describe.configure({ retries: 0 });

test("V3 installed navigation keeps Liquid Glass bounded and yields to the software keyboard", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "One canonical installed-iOS viewport is sufficient for the focused NAV geometry contract.",
  );

  const session = await signInLocalCountry();
  const { baseURL } = requiredLocalConfig();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installSession(context, session);
  const page = await context.newPage();

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expect(page.locator("[data-v3-liquid-tabbar]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary app navigation" })).toHaveCount(1);
  await expect(page.locator('[data-v3-liquid-tabbar] [aria-current="page"]')).toHaveCount(1);

  for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
    await expect(page.locator("[data-v3-liquid-tabbar]").getByRole("link", { name: label })).toHaveCount(1);
  }

  const initial = await readGeometry(page);
  expect(initial).not.toBeNull();
  if (!initial) return;

  expect(initial.collapsed).toBeFalse();
  expect(initial.overflow).toBeLessThanOrEqual(2);
  expect(initial.bar.left).toBeGreaterThanOrEqual(-1);
  expect(initial.bar.right).toBeLessThanOrEqual(initial.viewportWidth + 1);
  expect(initial.bar.top).toBeGreaterThan(initial.viewportHeight * 0.7);
  expect(initial.bar.bottom).toBeLessThanOrEqual(initial.viewportHeight + 1);
  expect(initial.material.height).toBeLessThanOrEqual(90);
  expect(initial.backdrop.width).toBeLessThanOrEqual(initial.material.width + 2);
  expect(initial.backdrop.height).toBeLessThanOrEqual(initial.material.height + 2);
  expect(Math.abs(initial.backdrop.left - initial.material.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(initial.backdrop.top - initial.material.top)).toBeLessThanOrEqual(1);
  expect(initial.lens.left).toBeGreaterThanOrEqual(initial.material.left - 1);
  expect(initial.lens.right).toBeLessThanOrEqual(initial.material.right + 1);
  expect(initial.lens.top).toBeGreaterThanOrEqual(initial.material.top - 1);
  expect(initial.lens.bottom).toBeLessThanOrEqual(initial.material.bottom + 1);
  for (const item of initial.items) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }
  expect(initial.obstruction).toBeGreaterThan(0);
  expect(initial.obstruction).toBeLessThanOrEqual(136);

  // Give the route enough scroll range to exercise the production hysteresis
  // hook without depending on whatever account data happens to be seeded.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.v3NavScrollFixture = "";
    spacer.style.height = "1600px";
    spacer.style.pointerEvents = "none";
    document.body.append(spacer);
    window.scrollTo({ top: 420, behavior: "instant" });
  });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute("data-collapsed", "true");
  await expect
    .poll(async () => (await readGeometry(page))?.material.height ?? initial.material.height)
    .toBeLessThan(initial.material.height - 1);

  const compact = await readGeometry(page);
  expect(compact).not.toBeNull();
  if (!compact) return;
  expect(compact.material.height).toBeLessThan(initial.material.height);
  expect(compact.material.width).toBeLessThanOrEqual(initial.material.width + 1);
  expect(compact.obstruction).toBeGreaterThan(0);
  expect(compact.obstruction).toBeLessThan(initial.obstruction);
  for (const item of compact.items) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }

  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector("[data-v3-nav-scroll-fixture]")?.remove();
  });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute("data-collapsed", "false");
  await expect
    .poll(async () => (await readGeometry(page))?.material.height ?? 0)
    .toBeGreaterThan(compact.material.height + 1);

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-solaris-keyboard-open", "true");
  });
  await expect
    .poll(async () => (await readGeometry(page))?.obstruction ?? -1)
    .toBe(0);
  await expect
    .poll(async () => (await readGeometry(page))?.pointerEvents ?? "")
    .toBe("none");
  await expect
    .poll(async () => (await readGeometry(page))?.opacity ?? "")
    .toBe("0");

  await page.evaluate(() => {
    document.documentElement.removeAttribute("data-solaris-keyboard-open");
  });
  await expect
    .poll(async () => (await readGeometry(page))?.obstruction ?? 0)
    .toBeGreaterThan(0);
  await expect(page.locator("[data-v3-liquid-tabbar]")).toBeVisible();

  await context.close();
});
