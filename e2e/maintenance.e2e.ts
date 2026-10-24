import { expect, test } from "@playwright/test";
import { MAINTENANCE_RETURN_DATE } from "../src/lib/maintenance";

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

test("Solaris Studio serves the TerraOS 3 maintenance teaser across the app", async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should be deliberately unavailable`).toBe(503);
    expect(response?.headers()["retry-after"]).toBeUndefined();
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");

    const main = page.locator('[data-solaris-maintenance="true"]');
    await expect(main).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TerraOS 3");
    await expect(page.getByText("Solaris Studio, rebuilt.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Estimated arrival", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(MAINTENANCE_RETURN_DATE, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Take a closer look." })).toBeVisible();
    await expect(page.getByText("Five places.", { exact: false }).first()).toBeVisible();
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=home"]')).toHaveCount(2);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=explore"]')).toHaveCount(1);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=participate"]')).toHaveCount(1);
    await expect(page.getByText("Solaris Studio", { exact: true }).first()).toBeVisible();
    await expect(page.locator('.mark[src="/solaris-studio-mark.png"]')).toBeVisible();

    await expect(page.locator('[data-locked-copy]')).toHaveCount(0);
    await expect(page.locator('.orbit')).toHaveCount(0);
    const nextRevealCount = await page.locator('[data-next-reveal]').count();
    expect(nextRevealCount, `${route} should expose at most one next reveal`).toBeLessThanOrEqual(1);

    await expect(page.getByText(/Solaris Studio is temporarily unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/database service error/i)).toHaveCount(0);
    await expect(page.getByText(/All Solaris Studio services are temporarily unavailable/i)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
});

test("TerraOS teaser preview route renders all five production V3 destinations without live data", async ({ page }) => {
  const supabaseRequests: string[] = [];
  page.on("request", (request) => {
    if (SUPABASE_API_PATH.test(new URL(request.url()).pathname)) {
      supabaseRequests.push(request.url());
    }
  });

  const home = await page.goto("/terraos-teaser-preview?screen=home", {
    waitUntil: "domcontentloaded",
  });
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

  const explore = await page.goto("/terraos-teaser-preview?screen=explore", {
    waitUntil: "domcontentloaded",
  });
  expect(explore?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="explore"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover the contest", exact: true })).toBeVisible();
  await expect(page.getByText("Search Solaris", { exact: true })).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Explore");

  const participate = await page.goto("/terraos-teaser-preview?screen=participate", {
    waitUntil: "domcontentloaded",
  });
  expect(participate?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="participate"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your participation", exact: true })).toBeVisible();
  await expect(page.getByText("Country confirmed", { exact: true }).first()).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Participate");

  const results = await page.goto("/terraos-teaser-preview?screen=results", {
    waitUntil: "domcontentloaded",
  });
  expect(results?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="results"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Official results", exact: true })).toBeVisible();
  await expect(page.getByText("Oland", { exact: true }).first()).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Results");

  const me = await page.goto("/terraos-teaser-preview?screen=me", {
    waitUntil: "domcontentloaded",
  });
  expect(me?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="me"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solaris", exact: true })).toBeVisible();
  await expect(page.getByText("Oland · Head of Delegation", { exact: true }).first()).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Me");

  const contentOnly = await page.goto("/terraos-teaser-preview?screen=home&chrome=content", {
    waitUntil: "domcontentloaded",
  });
  expect(contentOnly?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-chrome="content"]')).toBeVisible();
  await expect(page.locator(".v3-bottom-nav")).toHaveCount(0);

  expect(
    supabaseRequests,
    "fixture-only preview must not make auth, Data API, Edge Function, Storage, Realtime, or GraphQL requests",
  ).toEqual([]);
});

test("Five Places upgrades its static fallback panes to the real V3 screen previews", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const story = page.locator(".story-touch");
  await expect(story).toBeVisible();
  await story.scrollIntoViewIfNeeded();

  const previews = story.locator("iframe.terraos-v3-nav-preview");
  await expect(previews).toHaveCount(5);

  for (const screen of ["home", "explore", "participate", "results", "me"] as const) {
    await expect(
      story.locator(
        `iframe.terraos-v3-nav-preview[src="/terraos-teaser-preview?screen=${screen}&chrome=content"]`,
      ),
    ).toHaveCount(1);
  }

  await expect(previews.first()).toHaveCSS("pointer-events", "none");
});

test("TerraOS first-look device keeps a complete phone aspect on short desktop viewports", async ({ page }) => {
  const viewport = { width: 1366, height: 768 };
  await page.setViewportSize(viewport);
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const device = page.locator(".preview-device");
  const previewFrame = device.locator("iframe.preview-page");

  // The real V3 preview iframe is intentionally lazy-loaded below the fold.
  // Bring it into the viewport before checking its fitted phone geometry so the
  // child preview can render at the same responsive dimensions as its host.
  await device.scrollIntoViewIfNeeded();
  await expect(device).toBeVisible();
  await expect(previewFrame).toBeVisible();

  await expect
    .poll(async () => {
      const box = await device.boundingBox();
      if (!box || box.width === 0) return Number.POSITIVE_INFINITY;
      return Math.abs(box.height / box.width - 844 / 390);
    })
    .toBeLessThan(0.05);

  const box = await device.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.height).toBeLessThanOrEqual(viewport.height * 0.8);
});

test("TerraOS first-look preview fills its phone and keeps copy below mobile top chrome", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const firstLook = page.locator(".first-look");
  const device = firstLook.locator(".preview-device");
  const previewFrame = device.locator("iframe.preview-page");

  await firstLook.scrollIntoViewIfNeeded();
  await expect(previewFrame).toBeVisible();

  // The visible 1px device border belongs to the phone frame, not to the
  // embedded viewport. Measure the iframe against the frame's inner box so a
  // correct edge-to-edge preview is not reported as a 2px width regression.
  await expect
    .poll(async () => {
      return device.evaluate((element) => {
        const frame = element.querySelector<HTMLIFrameElement>("iframe.preview-page");
        if (!frame) return Number.POSITIVE_INFINITY;

        const deviceBox = element.getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect();
        const style = getComputedStyle(element);
        const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
        const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
        const innerLeft = deviceBox.left + borderLeft;
        const innerWidth = deviceBox.width - borderLeft - borderRight;

        return Math.max(
          Math.abs(innerLeft - frameBox.left),
          Math.abs(innerWidth - frameBox.width),
        );
      });
    })
    .toBeLessThan(1);

  // Compare internal geometry instead of absolute viewport Y. The maintenance
  // page intentionally uses smooth scrolling, so sampling immediately after a
  // scrollIntoView() call can catch the card mid-animation even though its
  // safe-area padding is already applied.
  await expect
    .poll(async () => {
      const [cardBox, copyBox] = await Promise.all([
        firstLook.boundingBox(),
        firstLook.locator(".first-look-copy h3").boundingBox(),
      ]);
      if (!cardBox || !copyBox) return Number.NEGATIVE_INFINITY;
      return copyBox.y - cardBox.y;
    })
    .toBeGreaterThanOrEqual(72);
});

test("TerraOS hero stays visually centered on a narrow phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const geometry = await page.locator("#maintenance-title").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const countdown = document.querySelector("#terraos-countdown")?.getBoundingClientRect();
    return {
      textLeft: text.left,
      textRight: text.right,
      textCenter: text.left + text.width / 2,
      countdownLeft: countdown?.left ?? -1,
      countdownRight: countdown?.right ?? -1,
      viewport: window.innerWidth,
    };
  });

  expect(geometry.textLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.textRight).toBeLessThanOrEqual(geometry.viewport);
  expect(Math.abs(geometry.textCenter - geometry.viewport / 2)).toBeLessThanOrEqual(2);
  expect(geometry.countdownLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.countdownRight).toBeLessThanOrEqual(geometry.viewport);
});

test("TerraOS maintenance hero stays above the fold on wide desktop", async ({ page }, testInfo) => {
  const viewport = { width: 1920, height: 1080 };
  await page.setViewportSize(viewport);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const hero = page.locator(".hero");
  const copy = page.locator(".hero-copy");
  const title = page.locator("#maintenance-title");
  const stage = page.locator(".hero-stage");

  await expect(hero).toBeVisible();
  await expect(copy).toBeVisible();
  await expect(title).toBeVisible();
  await expect(stage).toBeVisible();

  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
      if (!rect) return null;
      return {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        centerY: rect.top + rect.height / 2,
      };
    };

    return {
      hero: box(".hero"),
      copy: box(".hero-copy"),
      title: box("#maintenance-title"),
      stage: box(".hero-stage"),
    };
  });

  expect(geometry.hero).not.toBeNull();
  expect(geometry.copy).not.toBeNull();
  expect(geometry.title).not.toBeNull();
  expect(geometry.stage).not.toBeNull();
  if (!geometry.hero || !geometry.copy || !geometry.title || !geometry.stage) return;

  expect(geometry.hero.height).toBeLessThanOrEqual(760);
  expect(geometry.hero.bottom).toBeLessThanOrEqual(800);
  expect(geometry.title.top).toBeLessThan(480);
  expect(geometry.stage.top).toBeLessThan(420);
  expect(Math.abs(geometry.copy.centerY - geometry.stage.centerY)).toBeLessThan(150);

  await testInfo.attach("maintenance-desktop-1920x1080", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("maintenance mode blocks writes instead of forwarding them to app services", async ({ request }) => {
  const response = await request.post("/", {
    data: { probe: "maintenance-write-block" },
  });

  expect(response.status()).toBe(503);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["retry-after"]).toBeUndefined();
  await expect(response.json()).resolves.toMatchObject({
    error: "solaris_studio_maintenance",
    expected_return: "coming_soon",
  });
});
