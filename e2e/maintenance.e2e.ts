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

test("Solaris Studio serves the final TerraOS 3 maintenance story across the app", async ({ page }) => {
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

    for (const heading of [
      "One experience. Every moment.",
      "A new generation of Solaris.",
      "Everything in its place.",
      "What matters, now.",
      "Know exactly what needs you.",
      "To the moment it matters.",
      "More Solaris. Less searching.",
      "See what happened.",
      "Your Solaris.",
      "Take a closer look.",
      "Built for contest night.",
      "Your delegation keeps moving.",
      "TerraOS 3 is taking shape.",
    ]) await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=home&chrome=content"]')).toHaveCount(3);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=explore&chrome=content"]')).toHaveCount(3);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=participate&chrome=content"]')).toHaveCount(3);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=results&chrome=content"]')).toHaveCount(2);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=me&chrome=content"]')).toHaveCount(2);

    await expect(page.locator('img[src="/assets/terraos-maintenance/atmosphere.jpeg"]')).toHaveCount(3);
    await expect(page.locator('img[src="/assets/terraos-maintenance/moment-a.png"]')).toHaveCount(2);
    await expect(page.locator('img[src="/assets/terraos-maintenance/moment-b.png"]')).toHaveCount(2);
    await expect(page.locator("[data-rhythm-field]")).toHaveCount(7);

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

  const screens = [
    ["home", "Solaris now", "Home"],
    ["explore", "Discover the contest", "Explore"],
    ["participate", "Your participation", "Participate"],
    ["results", "Official results", "Results"],
    ["me", "Solaris", "Me"],
  ] as const;

  for (const [screen, heading, nav] of screens) {
    const response = await page.goto(`/terraos-teaser-preview?screen=${screen}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator(`[data-terraos-teaser-preview="${screen}"]`)).toBeVisible();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    const tabbar = page.locator(".v3-bottom-nav");
    await expect(tabbar).toBeVisible();
    await expect(tabbar.locator('[aria-current="page"]')).toContainText(nav);
  }

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
  await expect(page.locator('.hero-device-main')).toBeVisible();
  await expect(page.locator('.hero-device-left')).toBeHidden();
  await expect(page.locator('.hero-device-right')).toBeHidden();
  await expect(page.locator('.immersive-status').first()).toHaveCSS("position", "static");
  await expect(page.locator('.immersive-liquid')).toHaveCSS("position", "static");
  await expect(page.locator('.live-copy')).toHaveCSS("position", "static");

  const wordmarkFont = await page.locator("#maintenance-title").evaluate((element) => getComputedStyle(element).fontFamily);
  expect(wordmarkFont).toContain("Classica Crastao");
  const exploreText = (await page.locator("#explore-feature-title").innerText()).replace(/\s+/g, " ").trim();
  expect(exploreText).toBe("More Solaris. Less searching.");

  for (const selector of ["#maintenance-title", ".release-card", "#place-title", "#look-title", "#confirmation-title"]) {
    const geometry = await page.locator(selector).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    expect(geometry.left, selector).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, selector).toBeLessThanOrEqual(geometry.viewport + 1);
  }

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
  await expect(page.getByRole("heading", { name: "Your delegation keeps moving." })).toBeVisible();
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
