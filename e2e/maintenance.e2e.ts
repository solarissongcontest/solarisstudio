import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  "/",
  "/countries/ABE",
  "/editions/ssc-20",
  "/confirmations",
  "/televoting",
  "/mysolaris",
  "/admin",
] as const;

const MAINTENANCE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const SUPABASE_API_PATH = /\/(?:auth|rest|functions|storage|realtime|graphql)\/v1\//;
const HOSTED_SUPABASE = /https:\/\/[^/]+\.supabase\.co\b/i;

function collectHostedSupabaseRequests(page: Page) {
  const hosted: string[] = [];
  page.on("request", (request) => {
    if (HOSTED_SUPABASE.test(request.url())) hosted.push(request.url());
  });
  return hosted;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

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
    await expect(page.locator('img[src^="/assets/terraos-maintenance/moment-a.svg?v="]')).toHaveCount(2);
    await expect(page.locator('img[src^="/assets/terraos-maintenance/moment-b.svg?v="]')).toHaveCount(2);
    await expect(page.locator("[data-rhythm-field]")).toHaveCount(7);

    await expect(page.locator('[data-locked-copy]')).toHaveCount(0);
    await expect(page.locator('.orbit')).toHaveCount(0);
    await expect(page.locator('[data-next-reveal]')).toHaveCount(0);
    await expect(page.getByText(/Solaris Studio is temporarily unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/database service error/i)).toHaveCount(0);
    await expect(page.getByText(/All Solaris Studio services are temporarily unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/deployment|commit|pull request|supabase/i)).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
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

  await expectNoHorizontalOverflow(page);
});

for (const viewport of MAINTENANCE_VIEWPORTS) {
  test(`maintenance composition passes the ${viewport.width}x${viewport.height} acceptance matrix`, async ({ page }) => {
    const hostedSupabase = collectHostedSupabaseRequests(page);
    await page.setViewportSize(viewport);
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(503);

    const productBar = page.locator("[data-product-bar]");
    await expect(productBar).toHaveAttribute("data-scrolled", "false");
    await page.evaluate(() => window.scrollTo(0, 40));
    await expect(productBar).toHaveAttribute("data-scrolled", "false");
    await page.evaluate(() => window.scrollTo(0, 80));
    await expect(productBar).toHaveAttribute("data-scrolled", "true");

    if (viewport.width <= 430) {
      const barHeight = await productBar.evaluate((element) => element.getBoundingClientRect().height);
      expect(barHeight).toBeGreaterThanOrEqual(48);
      expect(barHeight).toBeLessThanOrEqual(54);
      await expect(page.locator(".hero-device-main")).toBeVisible();
      await expect(page.locator(".hero-device-left")).toBeHidden();
      await expect(page.locator(".hero-device-right")).toBeHidden();
      await expect(page.locator(".live-copy")).toHaveCSS("position", "static");
    }

    const photos = page.locator('[data-photo-kind="photo"]');
    await expect(photos).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const photo = photos.nth(index);
      await photo.scrollIntoViewIfNeeded();
      await expect.poll(() => photo.evaluate((image) =>
        image instanceof HTMLImageElement && image.complete ? image.naturalWidth : 0,
      )).toBeGreaterThan(0);
    }

    for (const selector of [
      ".hero-device-main",
      "#solaris-now .feature-preview-shell",
      "#participate-feature .feature-preview-shell",
      "#explore-feature .feature-preview-shell",
      "#results-feature .feature-preview-shell",
      "#me-feature .feature-preview-shell",
    ]) {
      const geometry = await page.locator(selector).first().evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewport: window.innerWidth };
      });
      expect(geometry.left, selector).toBeGreaterThanOrEqual(-1);
      expect(geometry.right, selector).toBeLessThanOrEqual(geometry.viewport + 1);
    }

    await page.locator("#explore-feature").evaluate((element) => {
      document.documentElement.style.scrollBehavior = "auto";
      element.scrollIntoView({ block: "start" });
    });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const obstruction = await page.evaluate(() => {
      const bar = document.querySelector("[data-product-bar]")?.getBoundingClientRect();
      const heading = document.querySelector("#explore-feature-title")?.getBoundingClientRect();
      if (!bar || !heading) return null;
      return { barBottom: bar.bottom, headingTop: heading.top };
    });
    expect(obstruction).not.toBeNull();
    expect(obstruction!.headingTop).toBeGreaterThanOrEqual(obstruction!.barBottom - 1);

    await expect(page.locator(".readiness-chapter")).toBeVisible();
    await expect(page.locator(".finale")).toBeVisible();
    const exploreText = (await page.locator("#explore-feature-title").innerText()).replace(/\s+/g, " ").trim();
    expect(exploreText).toBe("More Solaris. Less searching.");
    await expectNoHorizontalOverflow(page);
    expect(hostedSupabase).toEqual([]);
  });
}

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

/**
 * Maintenance is served outside React while the rest of Solaris is offline.
 * These geometry checks exercise the actual 503 document against local CI,
 * never the hosted Supabase project.
 */
async function topGeometry(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;height:var(--terraos-system-top-safe);width:0;visibility:hidden;pointer-events:none";
    document.body.append(probe);
    const safeBoundary = probe.getBoundingClientRect().height;
    probe.remove();

    const topOf = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing top-safe-zone target: ${selector}`);
      return element.getBoundingClientRect().top;
    };

    return {
      safeBoundary,
      toolbar: topOf(".product-bar"),
      brand: topOf(".product-bar .product-name"),
      confirmation: topOf(".product-bar .confirmation-link"),
      heroBranding: topOf("#maintenance-title"),
    };
  });
}

test("iPhone standalone maintenance reserves top system space before its first frame", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);
  await expect(page.locator("html")).toHaveAttribute("data-terraos-ios-standalone", "true");

  const portrait = await topGeometry(page);
  expect(portrait.safeBoundary).toBeGreaterThanOrEqual(60);
  expect(portrait.toolbar).toBeGreaterThanOrEqual(portrait.safeBoundary + 7);
  expect(portrait.brand).toBeGreaterThanOrEqual(portrait.safeBoundary + 7);
  expect(portrait.confirmation).toBeGreaterThanOrEqual(portrait.safeBoundary + 7);
  expect(portrait.heroBranding).toBeGreaterThanOrEqual(portrait.safeBoundary + 7);

  // The fallback belongs to the portrait iPhone system region, not to a
  // permanently cached viewport height after rotation.
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await topGeometry(page);
  expect(landscape.safeBoundary).toBeLessThan(40);
  expect(landscape.toolbar).toBeGreaterThanOrEqual(landscape.safeBoundary + 7);
  expect(landscape.toolbar).toBeLessThan(40);
});

test("ordinary mobile browsers do not inherit the standalone iPhone fallback", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);
  await expect(page.locator("html")).not.toHaveAttribute("data-terraos-ios-standalone");

  const geometry = await topGeometry(page);
  expect(geometry.safeBoundary).toBeLessThan(40);
  expect(geometry.toolbar).toBeGreaterThanOrEqual(geometry.safeBoundary + 7);
  expect(geometry.toolbar).toBeLessThan(40);
});
