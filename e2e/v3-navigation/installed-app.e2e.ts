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
    const activeItem = bar?.querySelector<HTMLElement>('[data-v3-tab-index][aria-current="page"]') ?? null;
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
        centerX: bounds.left + bounds.width / 2,
      };
    };

    const rootStyle = getComputedStyle(document.documentElement);
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      collapsed: bar.getAttribute("data-collapsed") === "true",
      layoutDirection: bar.getAttribute("data-layout-direction") ?? "ltr",
      bar: rect(bar),
      material: rect(material),
      backdrop: rect(backdrop),
      lens: rect(lens),
      activeItem: activeItem ? rect(activeItem) : null,
      items: items.map(rect),
      obstruction: Number.parseFloat(
        rootStyle.getPropertyValue("--v3-bottom-obstruction") || "0",
      ),
      opacity: getComputedStyle(bar).opacity,
      pointerEvents: getComputedStyle(bar).pointerEvents,
    };
  });
}

function expectBoundedNavigation(
  geometry: NonNullable<Awaited<ReturnType<typeof readGeometry>>>,
) {
  expect(geometry.overflow).toBeLessThanOrEqual(2);
  expect(geometry.bar.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.bar.right).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  expect(geometry.bar.top).toBeGreaterThan(geometry.viewportHeight * 0.7);
  expect(geometry.bar.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.material.height).toBeLessThanOrEqual(90);
  expect(geometry.backdrop.width).toBeLessThanOrEqual(geometry.material.width + 2);
  expect(geometry.backdrop.height).toBeLessThanOrEqual(geometry.material.height + 2);
  expect(Math.abs(geometry.backdrop.left - geometry.material.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.backdrop.top - geometry.material.top)).toBeLessThanOrEqual(1);
  expect(geometry.lens.left).toBeGreaterThanOrEqual(geometry.material.left - 1);
  expect(geometry.lens.right).toBeLessThanOrEqual(geometry.material.right + 1);
  expect(geometry.lens.top).toBeGreaterThanOrEqual(geometry.material.top - 1);
  expect(geometry.lens.bottom).toBeLessThanOrEqual(geometry.material.bottom + 1);
  for (const item of geometry.items) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }
}

test.describe.configure({ retries: 0 });

test("installed app shell survives representative navigation without duplicate chrome: V3 Liquid Glass stays bounded, compact and keyboard-safe", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "One canonical installed-iOS viewport is sufficient for the focused NAV geometry contract.",
  );

  const session = await signInLocalCountry();
  const { baseURL } = requiredLocalConfig();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
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

  expect(initial.collapsed).toBe(false);
  expect(initial.layoutDirection).toBe("ltr");
  expectBoundedNavigation(initial);
  expect(initial.obstruction).toBeGreaterThan(0);
  expect(initial.obstruction).toBeLessThanOrEqual(136);

  // This representative project intentionally runs with Reduced Motion. Prove
  // that CSS and the JS direct-manipulation guard both honor it.
  expect(
    await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);
  const activeLink = page.locator('[data-v3-liquid-tabbar] [aria-current="page"]');
  const activeBounds = await activeLink.boundingBox();
  expect(activeBounds).not.toBeNull();
  if (activeBounds) {
    const x = activeBounds.x + activeBounds.width / 2;
    const y = activeBounds.y + activeBounds.height / 2;
    await activeLink.dispatchEvent("pointerdown", {
      pointerId: 71,
      pointerType: "touch",
      button: 0,
      clientX: x,
      clientY: y,
    });
    await activeLink.dispatchEvent("pointermove", {
      pointerId: 71,
      pointerType: "touch",
      button: 0,
      clientX: x - 90,
      clientY: y,
    });
    await expect(page.locator(".v3-liquid-tabbar__material")).toHaveAttribute(
      "data-dragging",
      "false",
    );
    await activeLink.dispatchEvent("pointerup", {
      pointerId: 71,
      pointerType: "touch",
      button: 0,
      clientX: x - 90,
      clientY: y,
    });
  }

  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.dataset.v3NavScrollFixture = "";
    spacer.style.height = "1600px";
    spacer.style.pointerEvents = "none";
    document.body.append(spacer);
    window.scrollTo(0, 420);
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
    window.scrollTo(0, 0);
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

  // N12 explicitly requires RTL. Flip the document direction in-place so the
  // same authenticated installed-app state proves the mirrored lens geometry
  // without adding another backend fixture or any hosted Supabase traffic.
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute(
    "data-layout-direction",
    "rtl",
  );
  const rtl = await readGeometry(page);
  expect(rtl).not.toBeNull();
  if (!rtl) return;
  expect(rtl.layoutDirection).toBe("rtl");
  expectBoundedNavigation(rtl);
  expect(rtl.activeItem).not.toBeNull();
  if (rtl.activeItem) {
    expect(Math.abs(rtl.lens.centerX - rtl.activeItem.centerX)).toBeLessThanOrEqual(3);
  }

  await page.evaluate(() => {
    document.documentElement.dir = "ltr";
  });
  await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute(
    "data-layout-direction",
    "ltr",
  );

  await context.close();
});
