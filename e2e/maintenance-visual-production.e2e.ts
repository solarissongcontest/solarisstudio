import { expect, test } from "@playwright/test";

const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

const DESKTOP_VIEWPORTS = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

for (const viewport of PHONE_VIEWPORTS) {
  test(`TerraOS final story stays contained at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(503);

    await expect(page.locator(".hero-device-main")).toBeVisible();
    await expect(page.locator(".hero-device-left")).toBeHidden();
    await expect(page.locator(".hero-device-right")).toBeHidden();
    await expect(page.locator(".live-copy")).toHaveCSS("position", "static");
    await expect(page.locator(".immersive-status").first()).toHaveCSS("position", "static");
    await expect(page.locator(".immersive-liquid")).toHaveCSS("position", "static");

    const exploreText = await page.locator("#explore-feature-title").innerText();
    expect(exploreText.replace(/\s+/g, " ").trim()).toBe("More Solaris. Less searching.");
    expect(exploreText).not.toMatch(/searchin\s*g\./i);

    for (const selector of [
      "#maintenance-title",
      "#place-title",
      "#explore-feature-title",
      "#results-feature-title",
      "#look-title",
      "#confirmation-title",
      "#readiness-title",
    ]) {
      const geometry = await page.locator(selector).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, viewport: window.innerWidth };
      });
      expect(geometry.left, selector).toBeGreaterThanOrEqual(-1);
      expect(geometry.right, selector).toBeLessThanOrEqual(geometry.viewport + 1);
    }

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test(`TerraOS final story keeps image and rhythm composition balanced at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(503);

    await expect(page.locator(".photo-chapter")).toHaveCount(2);
    await expect(page.locator("[data-photo-parallax]")).toHaveCount(7);
    await expect(page.locator("[data-rhythm-field]")).toHaveCount(7);
    await expect(page.locator("[data-photo-kind=photo]")).toHaveCount(3);
    await expect(page.locator(".live-art")).toBeVisible();

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("rhythm fields respond to scroll while reduced motion keeps them static", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const field = page.locator("[data-rhythm-field]").first();
  const initial = await field.evaluate((element) => getComputedStyle(element).getPropertyValue("--rhythm-shift").trim());
  await page.locator("#results-feature").scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  const after = await field.evaluate((element) => getComputedStyle(element).getPropertyValue("--rhythm-shift").trim());
  expect(after).not.toBe(initial);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(80);
  const reducedInitial = await field.evaluate((element) => getComputedStyle(element).getPropertyValue("--rhythm-shift").trim());
  await page.locator("#results-feature").scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  const reducedAfter = await field.evaluate((element) => getComputedStyle(element).getPropertyValue("--rhythm-shift").trim());
  expect(reducedInitial).toBe("0");
  expect(reducedAfter).toBe("0");
});

test("image-led chapters use the dedicated local TerraOS asset namespace", async ({ page }) => {
  const remoteImageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() !== "image") return;
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") remoteImageRequests.push(request.url());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('img[src="/assets/terraos-maintenance/atmosphere.jpeg"]')).toHaveCount(3);
  await expect(page.locator('img[src="/assets/terraos-maintenance/moment-a.png"]')).toHaveCount(2);
  await expect(page.locator('img[src="/assets/terraos-maintenance/moment-b.png"]')).toHaveCount(2);
  expect(remoteImageRequests).toEqual([]);
});
