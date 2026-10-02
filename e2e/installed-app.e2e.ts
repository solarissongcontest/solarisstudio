import { expect, test, type Page } from "@playwright/test";

async function enableInstalledIosMode(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", {
      configurable: true,
      value: true,
    });
  });
}

async function skipFirstRun(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("solaris:app-first-run-complete:v1", "1");
    } catch {
      // Storage can be unavailable before the first document; the app remains testable.
    }
  });
}

async function expectInstalledShell(
  page: Page,
  route: string,
  options: { tabbar?: "visible" | "hidden" } = {},
) {
  await skipFirstRun(page);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-solaris-runtime", "standalone");
  await expect(page.locator("html")).toHaveAttribute("data-solaris-app", "");
  await expect(page.locator(".solaris-app-toolbar")).toHaveCount(1);
  await expect(page.locator(".solaris-app-toolbar")).toBeVisible();

  if (options.tabbar === "hidden") {
    await expect(page.locator(".solaris-app-tabbar")).toHaveCount(0);
  } else {
    await expect(page.locator(".solaris-app-tabbar")).toHaveCount(1);
    await expect(page.locator(".solaris-app-tabbar")).toBeVisible();
  }

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

async function expectNoBottomChromeCollision(page: Page, route: string) {
  const tabbar = page.locator(".solaris-app-tabbar");
  if ((await tabbar.count()) === 0 || !(await tabbar.isVisible())) return;

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(80);

  const collision = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".solaris-app-tabbar");
    const main = document.querySelector<HTMLElement>(".app-main[data-solaris-app-mode='true']");
    if (!bar || !main) return null;

    const barRect = bar.getBoundingClientRect();
    const children = [...main.children].filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.getClientRects().length > 0,
    );
    const last = children.at(-1);
    if (!last) return null;

    const rect = last.getBoundingClientRect();
    return {
      lastBottom: Math.round(rect.bottom),
      barTop: Math.round(barRect.top),
      obstruction: getComputedStyle(document.documentElement)
        .getPropertyValue("--solaris-app-bottom-obstruction")
        .trim(),
    };
  });

  if (collision) {
    expect(
      collision.lastBottom,
      `${route} final content must clear the tab bar (obstruction ${collision.obstruction})`,
    ).toBeLessThanOrEqual(collision.barTop + 2);
  }
}

test.beforeEach(async ({ page }) => {
  await enableInstalledIosMode(page);
});

test("installed app shell survives representative navigation without duplicate chrome", async ({ page }) => {
  for (const route of [
    "/",
    "/explore",
    "/editions",
    "/results",
    "/rules",
    "/site-directory",
    "/show-mode",
    "/settings",
  ]) {
    await expectInstalledShell(page, route);
    await expectNoBottomChromeCollision(page, route);
  }
});

test("route contract owns the active global tab on help and directory screens", async ({ page }) => {
  for (const route of ["/rules", "/site-directory"]) {
    await expectInstalledShell(page, route);
    const selected = page.locator(".solaris-app-tab[aria-current='page']");
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveAttribute("aria-label", "Explore");
  }
});

test("Show Mode renders the real minimal tab bar mode", async ({ page }) => {
  await expectInstalledShell(page, "/show-mode");
  await expect(page.locator(".solaris-app-tabbar")).toHaveAttribute("data-mode", "minimal");
  await expect(page.locator(".solaris-app-tabbar")).toHaveClass(/is-minimal/);
});

test("installed app chrome keeps Apple-sized effective touch targets", async ({ page }) => {
  await expectInstalledShell(page, "/explore");

  const undersized = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(
      ".solaris-app-toolbar button, .solaris-app-toolbar a, .solaris-app-tabbar button, .solaris-app-tabbar a",
    )].flatMap((node) => {
      if (node.getClientRects().length === 0) return [];
      const rect = node.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44
        ? []
        : [`${node.tagName.toLowerCase()}: ${Math.round(rect.width)}×${Math.round(rect.height)}`];
    }),
  );

  expect(undersized).toEqual([]);
});

test("first run is a contained bottom sheet and suppresses global tabs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const sheet = page.locator(".solaris-app-first-run");
  await expect(sheet).toBeVisible();

  const geometry = await sheet.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + 1);

  const tabbar = page.locator(".solaris-app-tabbar");
  await expect(tabbar).toHaveCSS("pointer-events", "none");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(sheet).toHaveCount(0);
});

test("installed app does not leak duplicate website chrome", async ({ page }) => {
  for (const route of ["/explore", "/results", "/site-directory"]) {
    await expectInstalledShell(page, route);
    await expect(page.locator(".site-nav")).not.toBeVisible();
    await expect(page.locator(".public-footer")).not.toBeVisible();
    await expect(page.locator(".mobile-quick-nav")).not.toBeVisible();
    await expect(page.locator(".solaris-app-toolbar")).toHaveCount(1);
    await expect(page.locator(".solaris-app-tabbar")).toHaveCount(1);
  }
});
