import { expect, test } from "@playwright/test";

const STORY_KEYS = ["home", "explore", "participate", "results", "me"] as const;

test("Take a closer look exposes five lazy immersive Story Views", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  await expect(page.locator("[data-story-showcase]"), "Story runway should load from the maintenance enhancement runtime").toBeVisible();
  await expect(page.locator(".story-teaser")).toHaveCount(5);
  await expect(page.locator(".look-story-button")).toHaveCount(5);

  for (const key of STORY_KEYS) {
    await expect(page.locator(`.story-teaser[data-story="${key}"]`)).toHaveCount(1);
  }

  const homePreview = 'iframe[src="/terraos-teaser-preview?screen=home&chrome=content"]';
  const beforeOpen = await page.locator(homePreview).count();
  await page.locator('.story-teaser[data-story="home"]').click();

  const layer = page.locator("[data-story-layer]");
  await expect(layer).toBeVisible();
  await expect(layer).toHaveAttribute("data-story", "home");
  await expect(page.locator("#story-view-title")).toHaveText("Home");
  await expect(page.locator(homePreview)).toHaveCount(beforeOpen + 1);

  await page.keyboard.press("ArrowRight");
  await expect(layer).toHaveAttribute("data-story", "explore");
  await expect(page.locator("#story-view-title")).toHaveText("Explore");

  await page.keyboard.press("Escape");
  await expect(layer).toBeHidden();
  await expect(page.locator(homePreview)).toHaveCount(beforeOpen);
});

test("TerraOS story composition remains inside a 390px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-story-showcase]")).toBeVisible();

  await expect(page.locator(".hero-device-left")).toBeHidden();
  await expect(page.locator(".hero-device-right")).toBeHidden();
  await expect(page.locator(".look-controls")).toBeHidden();

  const crastaoFamily = await page.locator("#maintenance-title").evaluate((element) => getComputedStyle(element).fontFamily);
  expect(crastaoFamily).toContain("Classica Crastao");

  for (const selector of ["#maintenance-title", "#place-title", "#look-title", "#story-showcase-title"]) {
    const geometry = await page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: window.innerWidth };
    });
    expect(geometry.left, selector).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, selector).toBeLessThanOrEqual(geometry.viewport + 1);
  }

  const pageOverflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);

  await page.locator('.story-teaser[data-story="participate"]').click();
  const layer = page.locator("[data-story-layer]");
  await expect(layer).toBeVisible();
  const storyOverflow = await layer.evaluate((element) => element.scrollWidth - element.clientWidth);
  expect(storyOverflow).toBeLessThanOrEqual(1);
});
