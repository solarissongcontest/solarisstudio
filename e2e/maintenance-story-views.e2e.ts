import { expect, test, type Page } from "@playwright/test";

const STORY_KEYS = ["home", "explore", "participate", "results", "me"] as const;

function collectHostedSupabaseRequests(page: Page) {
  const hosted: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/https:\/\/[^/]+\.supabase\.co\b/i.test(url)) hosted.push(url);
  });
  return hosted;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("Take a Closer Look is the five-card Story View entry point", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  await expect(page.locator("[data-story-card]")).toHaveCount(5);
  await expect(page.locator("[data-story-showcase]")).toHaveCount(0);
  await expect(page.locator("[data-story-carousel-progress]")).toContainText("1 / 5");

  for (const key of STORY_KEYS) {
    const card = page.locator(`[data-story-card="${key}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute("role", "button");
    await expect(card).toHaveAttribute("aria-haspopup", "dialog");
  }

  expect(hostedSupabase).toEqual([]);
});

test("Story history uses hashes, browser Back and exact card restoration", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const home = page.locator('[data-story-card="home"]');
  await home.scrollIntoViewIfNeeded();
  await home.focus();
  const origin = await page.evaluate(() => ({
    y: window.scrollY,
    carouselLeft: document.querySelector<HTMLElement>("[data-look-track]")?.scrollLeft ?? 0,
  }));

  await home.locator(".look-copy").click();
  const layer = page.locator("[data-story-layer]");
  await expect(layer).toBeVisible();
  await expect(page).toHaveURL(/#story-home$/);
  await expect(layer).toHaveAttribute("data-story", "home");
  await expect(page.locator("#story-view-title")).toContainText("What matters");
  await expect(page.locator('[data-story-comparison]')).toBeVisible();
  await expect(page.locator('[data-story-demo="home"]')).toBeVisible();

  await page.locator("[data-home-toggle]").click();
  await expect(page.locator("[data-home-demo-title]")).toHaveText("1 thing needs attention");
  await expect(page.locator("[data-home-responsibility]")).toBeVisible();

  await page.locator('[data-story-next="explore"]').click();
  await expect(page).toHaveURL(/#story-explore$/);
  await expect(layer).toHaveAttribute("data-story", "explore");

  await page.goBack();
  await expect(page).toHaveURL(/#story-home$/);
  await expect(layer).toHaveAttribute("data-story", "home");

  await page.goBack();
  await expect(layer).toBeHidden();
  await expect(page).not.toHaveURL(/#story-/);
  await expect(home).toBeFocused();

  const restored = await page.evaluate(() => ({
    y: window.scrollY,
    carouselLeft: document.querySelector<HTMLElement>("[data-look-track]")?.scrollLeft ?? 0,
  }));
  expect(Math.abs(restored.y - origin.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(restored.carouselLeft - origin.carouselLeft)).toBeLessThanOrEqual(2);
  await expect(home.locator("[data-story-card-cta]")).toHaveText("✓ Explored");
  expect(hostedSupabase).toEqual([]);
});

test("direct Story deep links are safe and invalid Story IDs fall back to maintenance", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);

  const response = await page.goto("/#story-results", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);
  await expect(page.locator("[data-story-layer]")).toBeVisible();
  await expect(page.locator("[data-story-layer]")).toHaveAttribute("data-story", "results");
  await expect(page.locator("#story-view-title")).toContainText("Start with");

  await page.locator('[data-result-tab="jury"]').click();
  await expect(page.locator("[data-result-fixture]")).toHaveText("results_jury");
  await expect(page.locator("[data-result-ranking] li").first()).toContainText("Vendia");

  await page.locator("[data-story-close]").click();
  await expect(page.locator("[data-story-layer]")).toBeHidden();
  await expect(page).not.toHaveURL(/#story-/);

  await page.goto("/#story-not-a-real-place", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-story-layer]")).toBeHidden();
  await expect(page).not.toHaveURL(/#story-/);
  expect(hostedSupabase).toEqual([]);
});

test("all five Story Views contain a comparison and a working fixture demo", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  for (const key of STORY_KEYS) {
    await page.evaluate((storyKey) => {
      history.replaceState(null, "", `#story-${storyKey}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, key);

    const layer = page.locator("[data-story-layer]");
    await expect(layer).toBeVisible();
    await expect(layer).toHaveAttribute("data-story", key);
    await expect(layer.locator("[data-story-comparison]")).toHaveCount(1);
    await expect(layer.locator(`[data-story-demo="${key}"]`)).toHaveCount(1);
    await expect(layer.locator(".story-real-preview-frame iframe")).toHaveCount(1);

    if (key === "explore") {
      await expect(layer.locator("[data-explore-query]")).toHaveValue("Oland");
      await expect(layer.locator("[data-explore-results]")).toBeVisible();
      await expect(layer.locator("[data-explore-archive]")).toBeVisible();
    }
    if (key === "participate") {
      await layer.locator("[data-participate-next]").click();
      await expect(layer.locator("[data-participate-status]")).toHaveText("Editing reopened");
      await layer.locator("[data-participate-next]").click();
      await expect(layer.locator("[data-participate-status]")).toHaveText("Submitted");
      await layer.locator("[data-participate-next]").click();
      await expect(layer.locator("[data-participate-status]")).toHaveText("✓ Complete");
    }
    if (key === "results") {
      await layer.locator('[data-result-tab="televote"]').click();
      await expect(layer.locator("[data-result-fixture]")).toHaveText("results_televote");
      await expect(layer.locator("[data-result-ranking] li").first()).toContainText("Oland");
    }
    if (key === "me") {
      await layer.locator("[data-me-history-toggle]").click();
      await expect(layer.locator("[data-me-history]")).toBeVisible();
      await expect(layer.locator("[data-me-history]")).toContainText("SSC 20");
    }
  }

  expect(hostedSupabase).toEqual([]);
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`Story composition is deliberate at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const hostedSupabase = collectHostedSupabaseRequests(page);
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".hero-device-left")).toBeHidden();
    await expect(page.locator(".hero-device-right")).toBeHidden();
    await expect(page.locator("[data-story-carousel-progress]")).toBeVisible();

    const cardRatio = await page.locator('[data-story-card="home"]').evaluate((element) =>
      element.getBoundingClientRect().width / window.innerWidth,
    );
    expect(cardRatio).toBeGreaterThan(0.8);
    expect(cardRatio).toBeLessThan(0.88);
    await expectNoHorizontalOverflow(page);

    await page.locator('[data-story-card="home"] .look-copy').click();
    const layer = page.locator("[data-story-layer]");
    await expect(layer).toBeVisible();

    const headerHeight = await layer.locator(".story-view-header").evaluate((element) => element.getBoundingClientRect().height);
    expect(headerHeight).toBeGreaterThanOrEqual(44);
    expect(headerHeight).toBeLessThanOrEqual(54);
    await expect(layer.locator("[data-story-close]")).toBeVisible();
    await expect(layer.locator(".story-comparison-tabs")).toBeVisible();

    await layer.locator('[data-comparison-tab="before"]').click();
    await expect(layer.locator('[data-comparison-panel="before"]')).toBeVisible();
    await expect(layer.locator('[data-comparison-panel="after"]')).toBeHidden();
    await expectNoHorizontalOverflow(page);

    await layer.locator("[data-story-close]").click();
    await expect(layer).toBeHidden();
    expect(hostedSupabase).toEqual([]);
  });
}

test("Story Views honor reduced motion without losing interactive state", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#story-explore", { waitUntil: "domcontentloaded" });

  const layer = page.locator("[data-story-layer]");
  await expect(layer).toBeVisible();
  await expect(layer.locator("[data-explore-query]")).toHaveValue("Oland");
  await expect(layer.locator("[data-explore-results]")).toBeVisible();
  await expect(layer.locator("[data-explore-archive]")).toBeVisible();

  const transition = await layer.evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(transition.split(",").every((duration) => duration.trim() === "0s")).toBe(true);
  expect(hostedSupabase).toEqual([]);
});
