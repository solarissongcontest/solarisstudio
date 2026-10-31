import { expect, test, type BrowserContext } from "@playwright/test";

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
      "Navbar interaction verification requires isolated local Supabase and country credentials.",
    );
  }
  test.skip(missing, "Local V3 navigation browser fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`Refusing navbar interaction E2E against non-local Supabase: ${url.origin}`);
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

test.describe.configure({ retries: 0 });

test(
  "installed app shell survives representative navigation without duplicate chrome: selected lens visibly engages, drags and snaps",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "The direct-manipulation probe runs once in the isolated WebKit installed-app context.",
    );

    const session = await signInLocalCountry();
    const { baseURL } = requiredLocalConfig();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "no-preference",
    });
    await installSession(context, session);
    const page = await context.newPage();
    await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });

    const nav = page.locator("[data-v3-liquid-tabbar]");
    const material = nav.locator(".v3-liquid-tabbar__material");
    const lens = nav.locator(".v3-liquid-tabbar__lens");
    const me = nav.getByRole("link", { name: /^Me(?:,|$)/ });
    await expect(nav).toBeVisible();
    await expect(me).toHaveAttribute("aria-current", "page");

    const restingLens = await lens.boundingBox();
    const meBox = await me.boundingBox();
    expect(restingLens).not.toBeNull();
    expect(meBox).not.toBeNull();
    if (!restingLens || !meBox) return;

    const startX = meBox.x + meBox.width / 2;
    const startY = meBox.y + meBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(420);

    await expect(material).toHaveAttribute("data-held", "true");
    const heldLens = await lens.boundingBox();
    expect(heldLens).not.toBeNull();
    if (!heldLens) return;
    expect(heldLens.width).toBeGreaterThan(restingLens.width * 1.1);
    expect(heldLens.height).toBeGreaterThan(restingLens.height * 1.08);

    await page.mouse.move(startX - 72, startY, { steps: 4 });
    const draggedLens = await lens.boundingBox();
    expect(draggedLens).not.toBeNull();
    if (!draggedLens) return;
    expect(draggedLens.x).toBeLessThan(heldLens.x - 20);
    expect(draggedLens.width).toBeGreaterThanOrEqual(heldLens.width);

    await page.mouse.up();
    await expect(page).toHaveURL(/\/results(?:[/?#]|$)/);
    await expect(material).toHaveAttribute("data-held", "false");
    await expect(nav.getByRole("link", { name: /^Results(?:,|$)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await expect
      .poll(async () => {
        const selected = await nav
          .locator('[data-v3-tab-index][aria-current="page"]')
          .boundingBox();
        const snapped = await lens.boundingBox();
        if (!selected || !snapped) return Number.POSITIVE_INFINITY;
        return Math.abs(
          snapped.x + snapped.width / 2 - (selected.x + selected.width / 2),
        );
      })
      .toBeLessThanOrEqual(3);

    await testInfo.attach("navbar-390-engaged-dragged-snapped.png", {
      body: await nav.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    await context.close();
  },
);
