import { expect, test } from "@playwright/test";

const OPEN_ROUTES = [
  "/", "/participate", "/auth", "/rules",
  "/confirmations", "/jury-voting", "/televoting",
] as const;
const HIDDEN_ROUTES = [
  "/explore", "/countries", "/editions", "/shows",
  "/results", "/me", "/my-solaris", "/my-solaris/account",
  "/fantasy", "/prediction-league", "/world",
  "/site-directory", "/guide", "/settings", "/notifications",
  "/confirmations/next-in-line", "/televoting/results",
] as const;

test("only the approved public and participation routes render", async ({ context }) => {
  // Each destination is an independent direct-load contract. Reusing one
  // WebKit document for seven full navigations can leave its old service
  // worker / page process alive and produce browser-internal navigation
  // errors unrelated to these routes. Keep every render and HTTP assertion.
  for (const route of OPEN_ROUTES) {
    const routePage = await context.newPage();
    try {
      const response = await routePage.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route).toBe(200);
      await expect(routePage.locator('[data-solaris-maintenance="true"]')).toHaveCount(0);
      await expect(routePage.locator("body")).not.toContainText("This page is not available yet");
    } finally {
      await routePage.close();
    }
  }
});

test("mobile Safari and desktop reach the actual Home instead of staying on the SSR bootstrap", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  // A 200 response can still display the query-free SSR bootstrap forever if
  // hydration or client assets fail. This was visible on an actual iPhone.
  await expect(page.locator("[data-v3-primary-boot]")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("header.site-nav")).toBeVisible();
  await expect(page.locator("main[data-public-layout]")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-solaris-runtime", "web");
  expect(errors, "Home must not crash during browser hydration").toEqual([]);
});

test("hidden public URLs fail closed at the Worker before app SSR", async ({ request }) => {
  for (const route of HIDDEN_ROUTES) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(404);
    expect(response.headers()["cache-control"], route).toContain("no-store");
    expect(response.headers()["x-robots-tag"], route).toContain("noindex");
    expect(await response.text(), route).toContain("This page is not available yet");
  }
});

for (const failure of ["disabled JavaScript", "blocked client modules"] as const) {
  test(`Home offers native recovery with ${failure}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: failure !== "disabled JavaScript", serviceWorkers: "block" });
    // This case needs only SSR HTML. No browser request may leave the local origin.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL!).origin || route.request().resourceType() === "script") {
        await route.abort();
      } else await route.continue();
    });
    const page = await context.newPage();
    try {
      await page.goto(baseURL!, { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-v3-primary-boot]")).toBeVisible();
      await page.getByText("Taking longer than expected?", { exact: true }).click();
      const reload = page.getByRole("button", { name: "Reload this page" });
      await expect(reload).toBeVisible();
      expect(await reload.evaluate((element) => element.closest('[aria-busy="true"]') !== null)).toBe(false);
      await Promise.all([page.waitForNavigation(), reload.click()]);
      expect(new URL(page.url()).pathname).toBe("/");
      expect(new URL(page.url()).search).toBe("");
      await expect(page.locator("[data-v3-primary-boot]")).toBeVisible();
      if (failure === "disabled JavaScript") await expect(page.getByText(/JavaScript is unavailable/)).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test("public home navigation does not advertise unpublished areas", async ({ context }) => {
  // Independent documents are essential for the installed WebKit project.
  // A second full navigation on the Home document can fail inside WebKit
  // before receiving any HTTP response. Do not weaken either release gate.
  const homePage = await context.newPage();
  try {
    await homePage.goto("/", { waitUntil: "domcontentloaded" });
    const nav = homePage.locator('nav[aria-label="Main navigation"], nav[aria-label="Primary navigation"]');
    const links = await nav.locator("a[href]").evaluateAll((items) =>
      items.map((item) => new URL((item as HTMLAnchorElement).href).pathname),
    );
    expect(links).not.toContain("/explore");
    expect(links).not.toContain("/results");
    expect(links).not.toContain("/my-solaris");
    expect(links).not.toContain("/me");
  } finally {
    await homePage.close();
  }

  // This is still a REAL browser direct load, not a mocked/request-only 404.
  const blockedPage = await context.newPage();
  try {
    const blocked = await blockedPage.goto("/results", { waitUntil: "domcontentloaded" });
    expect(blocked?.status()).toBe(404);
  } finally {
    await blockedPage.close();
  }
});

test("installed app launch never restores a hidden destination", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("limited-ios-"));
  await page.addInitScript(() => {
    try {
      const snapshot = { activeTab: "results" };
      localStorage.setItem("solaris:app-navigation:v1", JSON.stringify(snapshot));
      Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
      const original = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) =>
        query === "(display-mode: standalone)"
          ? { matches: true, media: query, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as MediaQueryList
          : original(query)
      ) as typeof window.matchMedia;
    } catch { /* storage unavailable before first document */ }
  });
  await page.goto("/app-launch", { waitUntil: "commit" });
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  // A stale Results tab must also stay on Home after the launch restore
  // coordinator has resolved or timed out its local session (1.5 seconds).
  await page.waitForTimeout(2_000);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("body")).not.toContainText("This page is not available yet");
});
