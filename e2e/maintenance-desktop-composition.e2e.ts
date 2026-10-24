import { expect, test } from "@playwright/test";

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

  // A desktop teaser should be a compact above-the-fold composition, not the
  // 148svh mobile scroll scene that previously stranded the content near the
  // bottom of a 1080px-tall monitor.
  expect(geometry.hero.height).toBeLessThanOrEqual(760);
  expect(geometry.hero.bottom).toBeLessThanOrEqual(800);
  expect(geometry.title.top).toBeLessThan(480);
  expect(geometry.stage.top).toBeLessThan(420);

  // The copy and device tableau should read as one horizontal composition.
  expect(Math.abs(geometry.copy.centerY - geometry.stage.centerY)).toBeLessThan(150);

  await testInfo.attach("maintenance-desktop-1920x1080", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});
