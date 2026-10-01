import { expect, test, type Page } from "@playwright/test";

async function enableInstalledIosMode(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
    try {
      localStorage.setItem("solaris:app-first-run-complete:v1", "1");
    } catch {
      // Storage can be unavailable before the first document; the app remains testable.
    }
  });
}

async function expectInstalledShell(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-solaris-runtime", "standalone");
  await expect(page.locator("html")).toHaveAttribute("data-solaris-app", "");
  await expect(page.locator(".solaris-app-toolbar")).toBeVisible();
  await expect(page.locator(".solaris-app-tabbar")).toBeVisible();

  const geometry = await page.evaluate(() => ({
    overflow:
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
      window.innerWidth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));

  expect(geometry.overflow, `${route} should not overflow in installed iOS mode`).toBeLessThanOrEqual(2);
  expect(geometry.viewportWidth).toBeGreaterThan(0);
  expect(geometry.viewportHeight).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await enableInstalledIosMode(page);
});

test("installed iOS shell survives core navigation without duplicate chrome", async ({ page }) => {
  for (const route of ["/", "/explore", "/results", "/rules"]) {
    await expectInstalledShell(page, route);
    await expect(page.locator(".solaris-app-toolbar")).toHaveCount(1);
    await expect(page.locator(".solaris-app-tabbar")).toHaveCount(1);
  }
});

test("installed iOS shell keeps touch controls reachable", async ({ page }) => {
  await expectInstalledShell(page, "/explore");

  const undersized = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(
      ".solaris-app-toolbar button, .solaris-app-tabbar button, .solaris-app-tabbar a",
    )].flatMap((node) => {
      if (node.getClientRects().length === 0) return [];
      const rect = node.getBoundingClientRect();
      return rect.width >= 24 && rect.height >= 24
        ? []
        : [`${node.tagName.toLowerCase()}: ${Math.round(rect.width)}×${Math.round(rect.height)}`];
    }),
  );

  expect(undersized).toEqual([]);
});
