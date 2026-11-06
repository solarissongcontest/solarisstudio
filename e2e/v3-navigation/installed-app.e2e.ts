import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { applyNavbarInstalledCssEmulation } from "./navbar-local-rollout";

type E2ESession = {
  access_token: string;
  user: { id: string; email?: string | null };
  [key: string]: unknown;
};

type LayoutDirection = "ltr" | "rtl";
type ProbeLabel = "Home" | "Participate" | "Me";

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

  const appOrigin = new URL(baseURL);
  if (appOrigin.hostname !== "127.0.0.1" && appOrigin.hostname !== "localhost") {
    throw new Error(`Refusing V3 navigation E2E against non-local app origin: ${appOrigin.origin}`);
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
    const bar = document.querySelector<HTMLElement>(".solaris-app-tabbar");
    const material = bar?.querySelector<HTMLElement>(".solaris-app-tabbar-material") ?? null;
    const backdrop = bar?.querySelector<HTMLElement>(".solaris-app-tabbar-backdrop") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".solaris-app-tab-indicator") ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-app-tab-index]"))
      : [];
    const activeItem = bar?.querySelector<HTMLElement>('[data-app-tab-index][aria-current="page"]') ?? null;
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
      layoutDirection: getComputedStyle(bar).direction === "rtl" ? "rtl" : "ltr",
      bar: rect(bar),
      material: rect(material),
      backdrop: rect(backdrop),
      lens: rect(lens),
      activeItem: activeItem ? rect(activeItem) : null,
      items: items.map(rect),
      obstruction: Number.parseFloat(
        rootStyle.getPropertyValue("--solaris-app-bottom-obstruction") || "0",
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

function accessibleLabel(label: ProbeLabel) {
  return new RegExp(`^${label}(?:,|$)`);
}

async function assertSelectedLensAlignment(
  page: Page,
  direction: LayoutDirection,
  label: ProbeLabel,
) {
  const nav = page.locator(".solaris-app-tabbar");
  const active = nav.locator('[data-app-tab-index][aria-current="page"]');
  const currentLabel = await active.getAttribute("aria-label");
  if (!currentLabel?.startsWith(label)) {
    await nav.getByRole("link", { name: accessibleLabel(label) }).click();
  }

  await expect.poll(() => nav.evaluate((element) => getComputedStyle(element).direction)).toBe(direction);
  await expect(active).toHaveAttribute("aria-label", accessibleLabel(label));
  await expect
    .poll(async () => {
      const geometry = await readGeometry(page);
      if (!geometry?.activeItem) return Number.POSITIVE_INFINITY;
      return Math.abs(geometry.lens.centerX - geometry.activeItem.centerX);
    })
    .toBeLessThanOrEqual(3);
}

test.describe.configure({ retries: 0 });

test("installed app shell survives representative navigation without duplicate chrome: canonical AppTabBar stays bounded, compact and keyboard-safe", async ({
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
  await applyNavbarInstalledCssEmulation(page);
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
  await expect(page.locator(".solaris-app-tabbar")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Solaris Studio" })).toHaveCount(1);
  await expect(page.locator('.solaris-app-tabbar [aria-current="page"]')).toHaveCount(1);

  for (const label of ["Home", "Explore", "Participate", "Results", "Me"]) {
    await expect(
      page.locator(".solaris-app-tabbar").getByRole("link", { name: label, exact: true }),
    ).toHaveCount(1);
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
  // that CSS and the JS direct-manipulation guard both honor it before route
  // probes change the current page and its scrollability.
  expect(
    await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
  ).toBe(true);
  const activeLink = page.locator('.solaris-app-tabbar [aria-current="page"]');
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
    await expect(page.locator(".solaris-app-tabbar-material")).toHaveAttribute(
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
    spacer.style.width = "1px";
    spacer.style.pointerEvents = "none";
    document.body.append(spacer);
    window.scrollTo(0, 0);
  });

  // Let the route-reset/listener effects settle before producing genuine
  // downward travel. A single synthetic jump immediately after DOMContentLoaded
  // can race the hook initialization and test hydration timing instead of the
  // responsive-bar contract.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.evaluate(() => window.scrollTo(0, 190));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(140);
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.evaluate(() => window.scrollTo(0, 420));

  await expect(page.locator(".solaris-app-tabbar")).toHaveAttribute("data-collapsed", "true");
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
  await expect(page.locator(".solaris-app-tabbar")).toHaveAttribute("data-collapsed", "false");
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
    // A real software-keyboard dismissal changes the VisualViewport/window
    // geometry. AppTabBar intentionally recomputes its JS-owned obstruction on
    // that resize signal; dispatch it here instead of testing an impossible
    // attribute-only lifecycle that leaves the last measured value stale.
    window.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => (await readGeometry(page))?.obstruction ?? 0)
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const geometry = await readGeometry(page);
      if (!geometry) return Number.POSITIVE_INFINITY;
      return Math.max(0, geometry.bar.bottom - geometry.viewportHeight);
    })
    .toBeLessThanOrEqual(1);
  await expect
    .poll(async () => (await readGeometry(page))?.pointerEvents ?? "")
    .toBe("auto");
  await expect
    .poll(async () => Number((await readGeometry(page))?.opacity ?? 0))
    .toBeGreaterThan(0.99);
  await expect(page.locator(".solaris-app-tabbar")).toBeVisible();

  // Probe first/middle/last physical lens positions only after the compact and
  // keyboard fixtures have completed on their original Account route. Route
  // transitions can legitimately replace scroll surfaces, so mixing these
  // probes into that fixture made the audit test its own setup instead of NAV.
  for (const label of ["Home", "Participate", "Me"] as const) {
    await assertSelectedLensAlignment(page, "ltr", label);
  }

  // N12 explicitly requires RTL. Flip the document direction in-place so the
  // same authenticated installed-app state proves mirrored physical geometry
  // without adding another backend fixture or any hosted Supabase traffic.
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  await expect
    .poll(() => page.locator(".solaris-app-tabbar").evaluate((element) => getComputedStyle(element).direction))
    .toBe("rtl");

  for (const label of ["Home", "Participate", "Me"] as const) {
    await assertSelectedLensAlignment(page, "rtl", label);
  }

  const rtl = await readGeometry(page);
  expect(rtl).not.toBeNull();
  if (!rtl) return;
  expect(rtl.layoutDirection).toBe("rtl");
  expectBoundedNavigation(rtl);

  await page.evaluate(() => {
    document.documentElement.dir = "ltr";
  });
  await expect
    .poll(() => page.locator(".solaris-app-tabbar").evaluate((element) => getComputedStyle(element).direction))
    .toBe("ltr");

  await context.close();
});

test("installed AppTabBar cancels held gestures on overlay/keyboard and restores tap and keyboard navigation", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "The isolated installed-iOS fixture owns this focused gesture interruption contract.",
  );

  // This helper refuses hosted Supabase and non-loopback app origins.
  const session = await signInLocalCountry();
  const { baseURL } = requiredLocalConfig();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await installSession(context, session);
  const page = await context.newPage();
  await page.goto(baseURL + "/my-solaris/account", { waitUntil: "domcontentloaded" });
  await applyNavbarInstalledCssEmulation(page);
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();

  const nav = page.locator(".solaris-app-tabbar");
  const material = nav.locator(".solaris-app-tabbar-material");
  await expect(nav).toBeVisible();
  const me = nav.getByRole("link", { name: accessibleLabel("Me") });
  await expect(me).toHaveAttribute("aria-current", "page");

  async function holdActiveLens() {
    // Route/scroll restoration can leave the dock collapsed. Its first pointer
    // down merely expands it, by design, so the deliberate hold probe must
    // first request the expanded state without starting an anchor gesture.
    if ((await nav.getAttribute("data-collapsed")) === "true") {
      await nav.dispatchEvent("pointerdown", {
        pointerId: 179,
        pointerType: "mouse",
        button: 0,
      });
    }
    await expect(nav).toHaveAttribute("data-collapsed", "false");
    await expect(nav).toBeVisible();
    const current = nav.locator('[data-app-tab-index][aria-current="page"]');
    // Page transitions can briefly paint a layer above the dock. Unlike
    // locator.click(), raw page.mouse.down() does not wait for actionability.
    // Do not start a hold until the tab is really the pointer hit target.
    await expect
      .poll(async () =>
        current.evaluate((link) => {
          const rect = link.getBoundingClientRect();
          const target = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return target === link || (target != null && link.contains(target));
        }),
      )
      .toBe(true);
    const bounds = await current.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) throw new Error("The selected tab must remain measurable");
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    const eligibility = await page.evaluate(() => ({
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      keyboardOpen: document.documentElement.hasAttribute("data-solaris-keyboard-open"),
      overlayOpen: document.documentElement.hasAttribute("data-solaris-feature-overlay-open"),
    }));
    expect(eligibility).toEqual({
      reducedMotion: false,
      keyboardOpen: false,
      overlayOpen: false,
    });
    await expect(material).toHaveAttribute("data-held", "true", { timeout: 3000 });
  }

  await holdActiveLens();
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-solaris-feature-overlay-open", "true"),
  );
  await expect(material).toHaveAttribute("data-held", "false");
  await page.evaluate(() =>
    document.documentElement.removeAttribute("data-solaris-feature-overlay-open"),
  );
  await page.mouse.up();
  await expect(page).toHaveURL(/\/my-solaris\/account(?:[?#]|$)/);

  // The interrupted pointer must not swallow the next legitimate tab tap.
  await nav.getByRole("link", { name: accessibleLabel("Home") }).click();
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);

  await holdActiveLens();
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-solaris-keyboard-open", "true"),
  );
  await expect(material).toHaveAttribute("data-held", "false");
  await page.evaluate(() =>
    document.documentElement.removeAttribute("data-solaris-keyboard-open"),
  );
  await page.mouse.up();
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);

  // Keyboard activation after a cancelled touch must remain a first-class path.
  const meReturn = nav.getByRole("link", { name: accessibleLabel("Me") });
  await meReturn.focus();
  await page.keyboard.press("Enter");
  await expect(meReturn).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/\/my-solaris(?:[/?#]|$)/);

  // A screen reader can dispatch a click without pointerdown or keydown.
  // Abort the held pointer while the cursor subsequently releases outside
  // the link; no click should arrive to clear the stale suppression flag.
  await holdActiveLens();
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-solaris-feature-overlay-open", "true"),
  );
  await expect(material).toHaveAttribute("data-held", "false");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await page.evaluate(() =>
    document.documentElement.removeAttribute("data-solaris-feature-overlay-open"),
  );
  await expect(page).toHaveURL(/\/my-solaris(?:[/?#]|$)/);

  // VoiceOver's detail=0 activation must work the first time, not the second.
  await nav.getByRole("link", { name: accessibleLabel("Home") }).dispatchEvent("click", {
    detail: 0,
  });
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);

  // A client-side redirect can replace the route while the active tab is
  // physically held. Route teardown must end hold, clear the update blocker,
  // and leave the next pointer navigation usable without a second tap.
  await nav.getByRole("link", { name: accessibleLabel("Me") }).click();
  await expect(page).toHaveURL(/\/my-solaris(?:[/?#]|$)/);
  await holdActiveLens();
  await nav.getByRole("link", { name: accessibleLabel("Home") }).dispatchEvent("click", {
    detail: 0,
  });
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);
  await expect(material).toHaveAttribute("data-held", "false");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect(page).toHaveURL(/\/(?:\?.*)?$/);
  await nav.getByRole("link", { name: accessibleLabel("Explore") }).click();
  await expect(page).toHaveURL(/\/explore(?:[?#]|$)/);
  await context.close();
});


test(
  "installed app shell survives representative navigation without duplicate chrome: installed iOS standalone protects semantic top chrome in portrait, landscape and keyboard states",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "The isolated WebKit installed-iOS project owns this top-safe geometry probe.",
    );

    // Browser.newContext does not inherit the project's device descriptor.
    // Explicit touch/mobile capabilities are essential here: the canonical
    // standalone iOS fallback is intentionally gated on (pointer: coarse).
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      reducedMotion: "reduce",
    });
    // Reuse the existing country-only isolated session; do not repeat the
    // Organizer feature-flag setup or add unnecessary fixture mutations.
    const session = await signInLocalCountry();
    const { baseURL } = requiredLocalConfig();
    await installSession(context, session);
    const page = await context.newPage();
    await page.goto(baseURL + "/my-solaris/account", { waitUntil: "domcontentloaded" });
    await applyNavbarInstalledCssEmulation(page);

    const header = page.locator(".v3-top-context");
    const nav = page.locator(".solaris-app-tabbar");
    await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
    await expect(header).toBeVisible();
    await expect(nav).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.solarisRuntime))
      .toBe("standalone");

    async function readSafeZone() {
      return page.evaluate(() => {
        const shell = document.querySelector<HTMLElement>("[data-solaris-v3]");
        const chrome = document.querySelector<HTMLElement>(".v3-top-context");
        if (!shell || !chrome) return null;
        const style = getComputedStyle(chrome);
        const chromeRect = chrome.getBoundingClientRect();
        const visibleControls = Array.from(
          chrome.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]:not([tabindex='-1'])"),
        ).filter((element) => getComputedStyle(element).visibility !== "hidden");
        return {
          runtime: document.documentElement.dataset.solarisRuntime ?? null,
          coarsePointer: matchMedia("(pointer: coarse)").matches,
          webkitSafeAreaSupport: CSS.supports("-webkit-touch-callout", "none"),
          viewport: { width: innerWidth, height: innerHeight },
          headerTop: chromeRect.top,
          safePadding: Number.parseFloat(style.paddingTop),
          computedSafeToken: getComputedStyle(shell).getPropertyValue("--v3-top-system-safe").trim(),
          firstControlTop: visibleControls.length
            ? Math.min(...visibleControls.map((element) => element.getBoundingClientRect().top))
            : null,
        };
      });
    }

    const measurements: Array<{ state: string; evidence: NonNullable<Awaited<ReturnType<typeof readSafeZone>>> }> = [];
    for (const state of [
      { label: "portrait", width: 390, height: 844, minimum: 66 },
      { label: "landscape", width: 844, height: 390, minimum: 26 },
      { label: "portrait-after-rotation", width: 390, height: 844, minimum: 66 },
    ]) {
      await page.setViewportSize({ width: state.width, height: state.height });
      await expect(header).toBeVisible();
      await expect
        .poll(async () => (await readSafeZone())?.safePadding ?? -1)
        .toBeGreaterThanOrEqual(state.minimum - 1);

      const evidence = await readSafeZone();
      expect(evidence).not.toBeNull();
      if (!evidence) throw new Error("Installed top-safe geometry became unreadable");
      expect(evidence.runtime).toBe("standalone");
      expect(evidence.coarsePointer).toBe(true);
      expect(evidence.webkitSafeAreaSupport).toBe(true);
      expect(evidence.safePadding).toBeGreaterThanOrEqual(state.minimum - 1);
      if (evidence.firstControlTop != null) {
        expect(evidence.firstControlTop).toBeGreaterThanOrEqual(
          evidence.headerTop + state.minimum - 1,
        );
      }
      measurements.push({ state: state.label, evidence });
    }

    await page.evaluate(() =>
      document.documentElement.setAttribute("data-solaris-keyboard-open", "true"),
    );
    const keyboard = await readSafeZone();
    expect(keyboard).not.toBeNull();
    expect(keyboard?.safePadding).toBeGreaterThanOrEqual(65);
    await page.evaluate(() =>
      document.documentElement.removeAttribute("data-solaris-keyboard-open"),
    );

    // Browser-only visitors must not inherit a fake 60px installed-app inset.
    // Toggle the CSS runtime marker only for this non-authoritative style probe,
    // then restore it without changing application identity or server state.
    await page.evaluate(() => {
      document.documentElement.dataset.solarisRuntime = "web";
    });
    const webToken = (await readSafeZone())?.computedSafeToken ?? "";
    expect(webToken).not.toContain("60px");
    await page.evaluate(() => {
      document.documentElement.dataset.solarisRuntime = "standalone";
    });
    await expect
      .poll(async () => (await readSafeZone())?.safePadding ?? -1)
      .toBeGreaterThanOrEqual(65);

    await testInfo.attach("installed-ios-top-safe-boundary.json", {
      body: Buffer.from(JSON.stringify({
        candidateSha: process.env.GITHUB_SHA ?? null,
        simulatedWebKitOnly: true,
        measurements,
        keyboard,
        webToken,
      }, null, 2)),
      contentType: "application/json",
    });
    await context.close();
  },
);


test("installed app shell survives representative navigation without duplicate chrome: wide landscape iPhone keeps bottom dock while iPad receives rail", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Run the isolated installed WebKit project.");

  const session = await signInLocalCountry();
  const { baseURL } = requiredLocalConfig();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await installSession(context, session);
  const page = await context.newPage();
  try {
    await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
    await applyNavbarInstalledCssEmulation(page);
    const nav = page.locator(".solaris-app-tabbar");
    await expect(nav).toBeVisible();

    for (const viewport of [
      { width: 956, height: 440, layout: "bar" },
      { width: 1024, height: 768, layout: "rail" },
      { width: 390, height: 844, layout: "bar" },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(nav).toHaveAttribute("data-layout", viewport.layout);
      const bounds = await readGeometry(page);
      expect(bounds, `${viewport.width}x${viewport.height} should render installed navigation`).not.toBeNull();
      if (!bounds) continue;
      expect(bounds.items).toHaveLength(5);
      bounds.items.forEach((item) => {
        expect(item.width).toBeGreaterThanOrEqual(44);
        expect(item.height).toBeGreaterThanOrEqual(44);
      });
      if (viewport.width === 956) {
        // A landscape phone crosses the old tablet-width breakpoint. Its dock
        // must still leave the accessibility tree when a keyboard obstructs it.
        await page.evaluate(() => document.documentElement.setAttribute("data-solaris-keyboard-open", "true"));
        await expect(nav).toBeHidden();
        await expect(nav).toHaveCSS("visibility", "hidden");
        await page.evaluate(() => document.documentElement.removeAttribute("data-solaris-keyboard-open"));
        await expect(nav).toBeVisible();
      }
      if (viewport.layout === "bar") {
        expect(bounds.material.height).toBeGreaterThanOrEqual(54);
        expect(bounds.material.height).toBeLessThanOrEqual(65);
        expect(bounds.material.width).toBeLessThanOrEqual(415);
        expect(bounds.bar.top).toBeGreaterThan(viewport.height / 2);
        expect(bounds.bar.bottom).toBeLessThanOrEqual(viewport.height + 1);
        expect(bounds.obstruction).toBeGreaterThan(0);
      } else {
        expect(bounds.material.width).toBeLessThanOrEqual(101);
        expect(bounds.bar.top).toBeLessThan(viewport.height / 2);
      }
    }
  } finally {
    await context.close();
  }
});
