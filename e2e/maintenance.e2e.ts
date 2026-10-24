import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/countries/ABE",
  "/editions/ssc-20",
  "/confirmations",
  "/televoting",
  "/mysolaris",
  "/admin",
] as const;

const SUPABASE_API_PATH = /\/(?:auth|rest|functions|storage|realtime|graphql)\/v1\//;

test("Solaris Studio serves the expanded TerraOS 3 maintenance experience across the app", async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should be deliberately unavailable`).toBe(503);
    expect(response?.headers()["retry-after"]).toBeUndefined();
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");

    const main = page.locator('[data-solaris-maintenance="true"]');
    await expect(main).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TerraOS 3");
    await expect(page.getByText("Solaris, reimagined.", { exact: true })).toBeVisible();
    await expect(page.locator(".arrival-line")).toContainText(/Estimated arrival|TerraOS 3 is being prepared\./);
    await expect(page.getByText("TerraOS 3 readiness", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "A new generation of Solaris." })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Everything\s*in its place\./ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What matters, now." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Know exactly what needs you." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "More Solaris. Less searching." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "See what happened." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your Solaris." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Take a closer look." })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Built for\s*contest night\./ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your delegation\s*keeps moving\./ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "TerraOS 3 is taking shape." })).toBeVisible();

    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=home&chrome=content"]')).toHaveCount(3);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=explore&chrome=content"]')).toHaveCount(3);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=participate&chrome=content"]')).toHaveCount(3);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=results&chrome=content"]')).toHaveCount(2);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=me&chrome=content"]')).toHaveCount(2);
    await expect(page.locator('.product-mark[src="/solaris-studio-mark.png"]')).toBeVisible();
    await expect(page.locator('.feature-art[src="/solaris-background.webp"]')).toHaveCount(1);
    await expect(page.locator('.feature-art[src="/solaris-studio-social.jpg"]')).toHaveCount(1);

    await expect(page.locator('[data-locked-copy]')).toHaveCount(0);
    await expect(page.locator('.orbit')).toHaveCount(0);
    await expect(page.locator('[data-next-reveal]')).toHaveCount(0);
    await expect(page.getByText(/Solaris Studio is temporarily unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/database service error/i)).toHaveCount(0);
    await expect(page.getByText(/All Solaris Studio services are temporarily unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/deployment|commit|pull request|supabase/i)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
});

test("TerraOS teaser preview route renders all five production V3 destinations without live data", async ({ page }) => {
  const supabaseRequests: string[] = [];
  page.on("request", (request) => {
    if (SUPABASE_API_PATH.test(new URL(request.url()).pathname)) supabaseRequests.push(request.url());
  });

  const home = await page.goto("/terraos-teaser-preview?screen=home", { waitUntil: "domcontentloaded" });
  expect(home?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="home"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).toBeVisible();
  await expect(page.getByText("You're all caught up", { exact: true })).toBeVisible();
  await expect(page.getByText("SSC 22 is the current Solaris edition", { exact: true })).toBeVisible();
  let tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Home");
  await expect(tabbar.locator('a[href="/"]').first()).toHaveAttribute("tabindex", "-1");
  const previewUrl = page.url();
  await tabbar.locator('a[href="/"]').first().focus();
  await page.keyboard.press("Enter");
  expect(page.url()).toBe(previewUrl);

  const explore = await page.goto("/terraos-teaser-preview?screen=explore", { waitUntil: "domcontentloaded" });
  expect(explore?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="explore"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover the contest", exact: true })).toBeVisible();
  await expect(page.getByText("Search Solaris", { exact: true })).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Explore");

  const participate = await page.goto("/terraos-teaser-preview?screen=participate", { waitUntil: "domcontentloaded" });
  expect(participate?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="participate"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your participation", exact: true })).toBeVisible();
  await expect(page.getByText("Country confirmed", { exact: true }).first()).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Participate");

  const results = await page.goto("/terraos-teaser-preview?screen=results", { waitUntil: "domcontentloaded" });
  expect(results?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="results"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Official results", exact: true })).toBeVisible();
  await expect(page.getByText("Oland", { exact: true }).first()).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Results");

  const me = await page.goto("/terraos-teaser-preview?screen=me", { waitUntil: "domcontentloaded" });
  expect(me?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="me"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solaris", exact: true })).toBeVisible();
  await expect(page.getByText("Oland · Head of Delegation", { exact: true }).first()).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Me");

  const contentOnly = await page.goto("/terraos-teaser-preview?screen=home&chrome=content", { waitUntil: "domcontentloaded" });
  expect(contentOnly?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-chrome="content"]')).toBeVisible();
  await expect(page.locator(".v3-bottom-nav")).toHaveCount(0);

  expect(
    supabaseRequests,
    "fixture-only preview must not make auth, Data API, Edge Function, Storage, Realtime, or GraphQL requests",
  ).toEqual([]);
});

test("Take a closer look exposes all five real V3 previews with non-swipe controls", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);
  const gallery = page.locator('[data-look-track]');
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery.locator('[data-look-card]')).toHaveCount(5);
  await expect(page.locator('[data-gallery-prev]')).toBeVisible();
  await expect(page.locator('[data-gallery-next]')).toBeVisible();
  for (const screen of ["home", "explore", "participate", "results", "me"] as const) {
    await expect(gallery.locator(`iframe[src="/terraos-teaser-preview?screen=${screen}&chrome=content"]`)).toHaveCount(1);
  }
  await expect(gallery.locator("iframe").first()).toHaveCSS("pointer-events", "none");
  await gallery.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => gallery.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("phone layout removes desktop overlaps and keeps every major chapter contained", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  await expect(page.locator('[data-product-bar]')).toBeVisible();
  await expect(page.getByText("TerraOS 3 readiness", { exact: true }).first()).toBeVisible();
  await expect(page.locator('.hero-device-main')).toBeVisible();
  await expect(page.locator('.hero-device-left')).toBeHidden();
  await expect(page.locator('.hero-device-right')).toBeHidden();
  await expect(page.locator('.immersive-status').first()).toHaveCSS("position", "static");
  await expect(page.locator('.immersive-liquid')).toHaveCSS("position", "static");
  await expect(page.locator('.live-copy')).toHaveCSS("position", "static");

  const wordmarkFont = await page.locator("#maintenance-title").evaluate((element) => getComputedStyle(element).fontFamily);
  expect(wordmarkFont).toContain("Classica Crastao");

  for (const selector of ["#maintenance-title", ".release-card", "#place-title", "#look-title", "#confirmation-title"]) {
    const geometry = await page.locator(selector).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    expect(geometry.left, selector).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, selector).toBeLessThanOrEqual(geometry.viewport + 1);
  }

  const majorSections = ["#solaris-now", "#participate-feature", "#explore-feature", "#results-feature", "#me-feature", "#preview", "#confirmation-access"];
  for (const selector of majorSections) await expect(page.locator(selector)).toHaveCount(1);

  const bodyFontSize = await page.locator("body").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(bodyFontSize).toBeGreaterThanOrEqual(16);

  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Confirmation remains an immediate maintenance destination", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);
  const confirmationLink = page.locator('.confirmation-link[href="#confirmation-access"]');
  await expect(confirmationLink).toBeVisible();
  await confirmationLink.click();
  await expect(page.locator("#confirmation-access")).toBeInViewport();
  await expect(page.getByRole("heading", { name: /Your delegation\s*keeps moving\./ })).toBeVisible();
});

test("maintenance mode blocks writes instead of forwarding them to app services", async ({ request }) => {
  const response = await request.post("/", { data: { probe: "maintenance-write-block" } });
  expect(response.status()).toBe(503);
  expect(response.headers()["content-type"]).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    error: "solaris_studio_maintenance",
    expected_return: "coming_soon",
  });
});
