import { expect, test, type Page } from "@playwright/test";

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
