import { readFileSync } from "node:fs";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Playwright can shim the JS display-mode signal but cannot emulate the CSS
// display-mode media feature. Visual release captures must therefore use the
// exact production app stylesheet with only those predicates neutralized, just
// like the installed-app invariant suite. Otherwise screenshots silently show
// browser-mode chrome while claiming to review the installed PWA.
const INSTALLED_APP_CSS_EMULATION = readFileSync("src/styles/app-shell.css", "utf8")
  .replace(/\(display-mode:\s*(?:standalone|window-controls-overlay)\)\s+and\s+/g, "")
  .replace(/\(display-mode:\s*(?:standalone|window-controls-overlay)\)/g, "all");

async function applyInstalledCssEmulation(page: Page) {
  await page.addStyleTag({ content: INSTALLED_APP_CSS_EMULATION });
}

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
  await applyInstalledCssEmulation(page);
  expect(response?.status(), `${path} should load for visual capture`).toBeLessThan(400);
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(180);

  await expect(page.locator("html")).toHaveAttribute("data-solaris-app", "");
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator(".solaris-app-toolbar")).toBeVisible();

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
    await applyInstalledCssEmulation(page);
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
    const href = await page
      .locator(`main a[href^="${directory.prefix}"]`)
      .first()
      .getAttribute("href")
      .catch(() => null);

    if (href) await test.step(href, () => capture(page, testInfo, href));
  }
});