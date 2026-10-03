import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function enableInstalledIosMode(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });

    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      if (query === "(display-mode: standalone)") {
        return {
          matches: true,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return originalMatchMedia(query);
    }) as typeof window.matchMedia;

    localStorage.setItem("solaris:app-first-run-complete:v1", "1");
  });
}

function slug(path: string) {
  return path.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home";
}

async function capture(page: Page, testInfo: TestInfo, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} should load for visual capture`).toBeLessThan(400);
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(180);

  await expect(page.locator("html")).toHaveAttribute("data-solaris-app", "");
  await expect(page.locator("main").first()).toBeVisible();

  await testInfo.attach(`visual-${slug(path)}.png`, {
    body: await page.screenshot({
      fullPage: true,
      animations: "disabled",
      caret: "hide",
    }),
    contentType: "image/png",
  });
}

test.beforeEach(async ({ page }) => {
  test.skip(
    process.env.E2E_VISUAL_CAPTURE !== "1",
    "Canonical visual review capture runs only in the release browser audit.",
  );
  await enableInstalledIosMode(page);
});

test("captures the canonical installed-app visual review set", async ({ page }, testInfo) => {
  const width = page.viewportSize()?.width ?? 390;
  const core = width <= 320
    ? ["/", "/explore", "/editions", "/results", "/rules", "/participate"]
    : [
        "/",
        "/explore",
        "/editions",
        "/countries",
        "/shows",
        "/results",
        "/rules",
        "/wiki",
        "/participate",
        "/site-directory",
        "/show-mode",
        "/settings",
      ];

  for (const path of core) {
    await test.step(path, () => capture(page, testInfo, path));
  }

  if (width <= 320) return;

  for (const directory of [
    { path: "/editions", prefix: "/editions/" },
    { path: "/countries", prefix: "/countries/" },
    { path: "/wiki", prefix: "/wiki/" },
  ]) {
    await page.goto(directory.path, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
    const href = await page
      .locator(`main a[href^="${directory.prefix}"]`)
      .first()
      .getAttribute("href")
      .catch(() => null);

    if (href) await test.step(href, () => capture(page, testInfo, href));
  }
});
