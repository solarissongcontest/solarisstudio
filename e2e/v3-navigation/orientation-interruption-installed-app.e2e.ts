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
      "V3 orientation-interruption evidence requires the isolated local Supabase fixture.",
    );
  }
  test.skip(missing, "Local V3 orientation-interruption fixture is unavailable");

  const url = new URL(supabaseUrl!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(
      `Refusing V3 orientation-interruption E2E against hosted Supabase: ${url.origin}`,
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

async function targetSizes(page: import("@playwright/test").Page) {
  return page.locator("[data-v3-liquid-tabbar] a").evaluateAll((links) =>
    links.map((link) => {
      const rect = link.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
}

test.describe.configure({ retries: 0 });

test("installed app shell survives representative navigation without duplicate chrome: edge drag resists and orientation change cancels it without navigation or stale geometry", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "ios-pwa-portrait", "Focused installed-iOS contract only");

  const session = await signIn();
  const { baseURL } = localConfig();
  // The representative project intentionally uses Reduced Motion for its normal
  // geometry probe. This focused test is specifically about direct manipulation,
  // so make the local context's motion intent explicit rather than inheriting an
  // ambient project preference and accidentally disabling the gesture under test.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await installSession(context, session);
  const page = await context.newPage();

  await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();

  const nav = page.locator("[data-v3-liquid-tabbar]");
  const material = nav.locator(".v3-liquid-tabbar__material");
  const meLink = nav.getByRole("link", { name: "Me", exact: true });
  await expect(nav).toBeVisible();
  await expect(meLink).toHaveAttribute("aria-current", "page");

  const portraitMaterial = await material.boundingBox();
  const meBox = await meLink.boundingBox();
  expect(portraitMaterial).not.toBeNull();
  expect(meBox).not.toBeNull();

  const startX = meBox!.x + meBox!.width / 2;
  const startY = meBox!.y + meBox!.height / 2;
  // Keep the pointer itself inside the 390px viewport while still pulling beyond
  // the final destination's legal travel range.
  const rawEdgeDrag = 36;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Me is the final LTR destination. Pulling farther right must rubber-band the
  // lens locally instead of exposing or selecting an imaginary sixth tab.
  await page.mouse.move(startX + rawEdgeDrag, startY, { steps: 3 });
  await expect(material).toHaveAttribute("data-drag-direction", /.+/);
  const resistedEdgeDrag = await material.evaluate((element) =>
    Number.parseFloat(element.style.getPropertyValue("--v3-liquid-drag-x") || "0"),
  );
  expect(resistedEdgeDrag).toBeGreaterThan(0);
  expect(resistedEdgeDrag).toBeLessThan(rawEdgeDrag);
  await expect(meLink).toHaveAttribute("aria-current", "page");

  // A real orientation transition also emits resize. Either interruption must
  // cancel the in-flight direct-manipulation gesture before the browser can
  // synthesize a trailing click against a different tab.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));

  await expect(material).not.toHaveAttribute("data-drag-direction", /.+/);
  await expect
    .poll(() =>
      material.evaluate((element) =>
        element.style.getPropertyValue("--v3-liquid-drag-x").trim(),
      ),
    )
    .toBe("0px");
  await page.mouse.up();

  await expect(page).toHaveURL(/\/my-solaris\/account\/?$/);
  await expect(meLink).toHaveAttribute("aria-current", "page");
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

  const landscapeNav = await nav.boundingBox();
  const landscapeMaterial = await material.boundingBox();
  expect(landscapeNav).not.toBeNull();
  expect(landscapeMaterial).not.toBeNull();
  expect(landscapeNav!.x).toBeGreaterThanOrEqual(0);
  expect(landscapeNav!.x + landscapeNav!.width).toBeLessThanOrEqual(844.5);
  expect(landscapeNav!.y + landscapeNav!.height).toBeLessThanOrEqual(390.5);
  expect(landscapeMaterial!.height).toBeGreaterThanOrEqual(44);
  expect(landscapeMaterial!.height).toBeLessThan(portraitMaterial!.height);

  for (const target of await targetSizes(page)) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }

  // Rotate back without reloading. The same semantic tab remains selected and
  // the resting shell expands again instead of retaining landscape morphology.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
  await expect(page).toHaveURL(/\/my-solaris\/account\/?$/);
  await expect(meLink).toHaveAttribute("aria-current", "page");
  await expect(material).not.toHaveAttribute("data-drag-direction", /.+/);

  const restoredMaterial = await material.boundingBox();
  expect(restoredMaterial).not.toBeNull();
  expect(restoredMaterial!.height).toBeGreaterThan(landscapeMaterial!.height);

  await context.close();
});
