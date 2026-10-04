import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { STATIC_PUBLIC_ROUTES } from "./audit-helpers";

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
    "/wiki",
    "/shows",
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

test("installed app keeps exactly one visible screen heading on app-owned screens", async ({ page }) => {
  for (const route of [
    "/",
    "/explore",
    "/results",
    "/countries",
    "/editions",
    "/wiki",
    "/shows",
    "/site-directory",
    "/settings",
  ]) {
    await expectInstalledShell(page, route);
    await expect(page.locator("h1:visible"), `${route} should expose one visible h1`).toHaveCount(1);
  }
});

test("directory title collapses without changing sticky toolbar geometry", async ({ page }) => {
  await expectInstalledShell(page, "/wiki");

  const toolbar = page.locator(".solaris-app-toolbar");
  const largeTitle = page.locator(".solaris-app-large-title-flow");
  const compactTitle = page.locator(".solaris-app-toolbar-context-title-collapsible");

  await expect(toolbar).toHaveAttribute("data-collapsible-title", "true");
  await expect(toolbar).toHaveAttribute("data-title-collapsed", "false");
  await expect(largeTitle).toBeVisible();
  await expect(compactTitle).toHaveAttribute("aria-hidden", "true");

  const initial = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>(".solaris-app-toolbar");
    const title = document.querySelector<HTMLElement>(".solaris-app-large-title-flow");
    const compact = document.querySelector<HTMLElement>(
      ".solaris-app-toolbar-context-title-collapsible",
    );
    if (!toolbar || !title || !compact) return null;

    const toolbarRect = toolbar.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      toolbarHeight: toolbarRect.height,
      toolbarBottom: toolbarRect.bottom,
      titleTop: titleRect.top,
      titleHeight: titleRect.height,
      compactOpacity: Number.parseFloat(getComputedStyle(compact).opacity),
    };
  });

  expect(initial).not.toBeNull();
  expect(initial!.titleTop).toBeGreaterThanOrEqual(initial!.toolbarBottom - 1);
  expect(initial!.titleHeight).toBeGreaterThan(20);
  expect(initial!.compactOpacity).toBeLessThan(0.1);

  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".app-main");
    if (!main) return;
    const spacer = document.createElement("div");
    spacer.dataset.solarisCollapseTestSpacer = "true";
    spacer.style.height = "1200px";
    spacer.style.pointerEvents = "none";
    main.appendChild(spacer);
  });

  const toolbarHeights: number[] = [];
  for (const y of [0, 16, 32, 48, 72, 96]) {
    await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
    await page.waitForTimeout(35);
    toolbarHeights.push(
      await toolbar.evaluate((node) => node.getBoundingClientRect().height),
    );
  }

  expect(Math.max(...toolbarHeights) - Math.min(...toolbarHeights)).toBeLessThanOrEqual(1);
  await expect(toolbar).toHaveAttribute("data-title-collapsed", "true");

  const collapsed = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>(".solaris-app-large-title-flow");
    const compact = document.querySelector<HTMLElement>(
      ".solaris-app-toolbar-context-title-collapsible",
    );
    if (!title || !compact) return null;
    return {
      titleHeight: title.getBoundingClientRect().height,
      titleBottom: title.getBoundingClientRect().bottom,
      compactOpacity: Number.parseFloat(getComputedStyle(compact).opacity),
    };
  });

  expect(collapsed).not.toBeNull();
  expect(Math.abs(collapsed!.titleHeight - initial!.titleHeight)).toBeLessThanOrEqual(1);
  expect(collapsed!.titleBottom).toBeLessThanOrEqual(initial!.toolbarBottom + 2);
  expect(collapsed!.compactOpacity).toBeGreaterThan(0.9);
});

test("installed directory search has exactly one visible field surface", async ({ page }) => {
  await expectInstalledShell(page, "/wiki");

  const search = page.locator("[data-solaris-search-field]");
  await expect(search).toHaveCount(1);
  const input = search.locator("input[type='search']");
  await expect(input).toHaveCount(1);

  const visual = await search.evaluate((node) => {
    const input = node.querySelector<HTMLInputElement>("input[type='search']");
    if (!input) return null;
    const shellStyle = getComputedStyle(node);
    const inputStyle = getComputedStyle(input);
    return {
      shellRadius: Number.parseFloat(shellStyle.borderTopLeftRadius || "0"),
      shellBorder: Number.parseFloat(shellStyle.borderTopWidth || "0"),
      inputBackground: inputStyle.backgroundColor,
      inputBorder: Number.parseFloat(inputStyle.borderTopWidth || "0"),
      inputRadius: Number.parseFloat(inputStyle.borderTopLeftRadius || "0"),
      inputShadow: inputStyle.boxShadow,
    };
  });

  expect(visual).not.toBeNull();
  expect(visual!.shellRadius).toBeGreaterThan(0);
  expect(visual!.shellBorder).toBeGreaterThan(0);
  expect(visual!.inputBorder).toBe(0);
  expect(visual!.inputRadius).toBe(0);
  expect(visual!.inputShadow).toBe("none");
  expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(visual!.inputBackground);
});

test("directory screens do not leak website descriptions below the app title", async ({ page }) => {
  for (const route of ["/editions", "/wiki", "/shows", "/countries", "/site-directory"]) {
    await expectInstalledShell(page, route);
    await expect(page.locator(".solaris-app-page-context > p")).toHaveCount(0);
  }
});

test("content-owned screens do not repeat their title inside the toolbar", async ({ page }) => {
  for (const route of ["/analysis", "/records", "/rules", "/result-lab"]) {
    await expectInstalledShell(page, route);
    await expect(page.locator(".solaris-app-toolbar-context-title")).toHaveCount(0);
    await expect(page.locator("h1:visible")).toHaveCount(1);
  }

  await expectInstalledShell(page, "/settings");
  await expect(page.locator(".solaris-app-toolbar-context-title")).toHaveCount(1);
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


async function auditInstalledRoute(page: Page, route: string, testInfo: TestInfo) {
  await skipFirstRun(page);
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${route} document status`).toBeLessThan(400);
  await expect(page.locator("html")).toHaveAttribute("data-solaris-app", "");
  await expect(page.locator("main").first()).toBeVisible();

  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  await page.waitForTimeout(120);

  const result = await page.evaluate(() => {
    const visible = (node: Element) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const visibleH1 = [...document.querySelectorAll("h1")].filter(visible);
    const main = document.querySelector<HTMLElement>(
      ".app-main[data-solaris-app-mode='true']",
    );
    const requestedTabbar = main?.dataset.solarisAppTabbar ?? "visible";
    const tabbars = [...document.querySelectorAll(".solaris-app-tabbar")].filter(visible);
    const websiteChrome = [
      ...document.querySelectorAll(".site-nav, .mobile-quick-nav, .public-footer"),
    ].filter(visible);

    const flagProblems = [
      ...document.querySelectorAll<HTMLElement>('[data-flag-frame="standard"]'),
    ].flatMap((frame) => {
      if (!visible(frame)) return [];
      const rect = frame.getBoundingClientRect();
      const style = getComputedStyle(frame);
      const radius = Number.parseFloat(style.borderTopLeftRadius || "0");
      const image = frame.querySelector<HTMLImageElement>('[data-flag-role="standard"]');
      const imageStyle = image ? getComputedStyle(image) : null;
      const problems: string[] = [];
      if (Math.abs(rect.width / rect.height - 1.5) > 0.04) {
        problems.push(`ratio ${(rect.width / rect.height).toFixed(2)}`);
      }
      if (style.overflow !== "hidden" && style.overflow !== "clip") {
        problems.push(`overflow ${style.overflow}`);
      }
      if (!(radius > 0)) problems.push("square corners");
      if (imageStyle && imageStyle.objectFit !== "cover") {
        problems.push(`object-fit ${imageStyle.objectFit}`);
      }
      return problems.length ? [problems.join(", ")] : [];
    });

    const chromeControls = [
      ...document.querySelectorAll<HTMLElement>(
        ".solaris-app-toolbar button, .solaris-app-toolbar a, .solaris-app-tabbar button, .solaris-app-tabbar a",
      ),
    ].flatMap((node) => {
      if (!visible(node) || getComputedStyle(node).pointerEvents === "none") return [];
      const rect = node.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44
        ? []
        : [`${node.tagName.toLowerCase()} ${Math.round(rect.width)}×${Math.round(rect.height)}`];
    });

    return {
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      visibleH1: visibleH1.length,
      toolbarCount: [...document.querySelectorAll(".solaris-app-toolbar")].filter(visible).length,
      requestedTabbar,
      tabbarCount: tabbars.length,
      websiteChrome: websiteChrome.map((node) => (node as HTMLElement).className),
      flagProblems,
      chromeControls,
      bootGuardStillPresent: document.documentElement.hasAttribute("data-solaris-app-boot"),
    };
  });

  expect(result.overflow, `${route} horizontal overflow in installed mode`).toBeLessThanOrEqual(2);
  expect(result.visibleH1, `${route} should expose exactly one visible h1`).toBe(1);
  expect(result.toolbarCount, `${route} should expose one app toolbar`).toBe(1);
  expect(result.websiteChrome, `${route} leaked website chrome`).toEqual([]);
  expect(result.flagProblems, `${route} has non-canonical flag frames`).toEqual([]);
  expect(result.chromeControls, `${route} has undersized app chrome controls`).toEqual([]);
  expect(result.bootGuardStillPresent, `${route} first-paint guard must clear after hydration`).toBe(false);

  if (result.requestedTabbar === "hidden") {
    expect(result.tabbarCount, `${route} should hide the global tab bar`).toBe(0);
  } else {
    expect(result.tabbarCount, `${route} should expose one global tab bar`).toBe(1);
  }

  await testInfo.attach(`installed-route-${route.replace(/[^a-z0-9]+/gi, "-") || "home"}.json`, {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: "application/json",
  });
}

for (let shard = 0; shard < 4; shard += 1) {
  test(`installed-app route invariant crawl — shard ${shard + 1}`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "The exhaustive installed-app crawl runs once at the representative iPhone width.",
    );

    const failures: string[] = [];
    const routes = [...STATIC_PUBLIC_ROUTES]
      .sort()
      .filter((_, index) => index % 4 === shard);

    for (const route of routes) {
      try {
        await test.step(route, () => auditInstalledRoute(page, route, testInfo));
      } catch (error) {
        failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    expect(failures, "Every static public route should preserve installed-app invariants").toEqual([]);
  });
}

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
