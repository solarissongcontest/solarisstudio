import { expect, test, type Page } from "@playwright/test";

const STORY_KEYS = ["home", "explore", "participate", "results", "me"] as const;
const STORY_DESKTOP_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

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

test("Story dialog traps keyboard focus and Escape restores the originating card", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const origin = page.locator('[data-story-card="home"]');
  await origin.scrollIntoViewIfNeeded();
  await origin.focus();
  await page.keyboard.press("Enter");

  const layer = page.locator("[data-story-layer]");
  const close = layer.locator("[data-story-close]");
  const next = layer.locator('[data-story-next="explore"]');
  await expect(layer).toBeVisible();
  await expect(page).toHaveURL(/#story-home$/);
  await expect(close).toBeFocused();
  await expect(page.locator('[data-solaris-maintenance="true"]')).toHaveAttribute("inert", "");

  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(next).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(layer).toBeHidden();
  await expect(page).not.toHaveURL(/#story-/);
  await expect(origin).toBeFocused();
  await expect(page.locator('[data-solaris-maintenance="true"]')).not.toHaveAttribute("inert", "");
  expect(hostedSupabase).toEqual([]);
});

for (const viewport of STORY_DESKTOP_VIEWPORTS) {
  test(`all Story Views fit the ${viewport.width}x${viewport.height} desktop matrix`, async ({ page }) => {
    const hostedSupabase = collectHostedSupabaseRequests(page);
    await page.setViewportSize(viewport);

    for (const key of STORY_KEYS) {
      const response = await page.goto(`/#story-${key}`, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(503);

      const layer = page.locator("[data-story-layer]");
      await expect(layer).toBeVisible();
      await expect(layer).toHaveAttribute("data-story", key);
      await expect(layer.locator("[data-story-close]")).toBeVisible();
      await expect(layer.locator(".story-real-preview-frame")).toBeVisible();
      await expect(layer.locator(".story-real-preview-frame iframe")).toHaveCount(1);
      await expect(layer.locator(".story-finale")).toBeVisible();

      const shellGeometry = await layer.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      expect(shellGeometry.left).toBeGreaterThanOrEqual(-1);
      expect(shellGeometry.right).toBeLessThanOrEqual(shellGeometry.viewportWidth + 1);
      expect(shellGeometry.top).toBeGreaterThanOrEqual(-1);
      expect(shellGeometry.width).toBeGreaterThanOrEqual(shellGeometry.viewportWidth - 2);

      const finalAction = layer.locator(
        key === "me" ? "[data-story-finish]" : "[data-story-next]",
      );
      await finalAction.scrollIntoViewIfNeeded();
      await expect(finalAction).toBeInViewport();
      await expect(finalAction).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    expect(hostedSupabase).toEqual([]);
  });
}

test("phone Story finale keeps the next action reachable without horizontal escape", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);
  await page.setViewportSize({ width: 320, height: 568 });
  const response = await page.goto("/#story-home", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const layer = page.locator("[data-story-layer]");
  const next = layer.locator('[data-story-next="explore"]');
  await expect(layer).toBeVisible();
  await next.scrollIntoViewIfNeeded();
  await expect(next).toBeVisible();
  await expect(next).toBeInViewport();

  const geometry = await next.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewport: window.innerWidth };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
  await expectNoHorizontalOverflow(page);
  expect(hostedSupabase).toEqual([]);
});
