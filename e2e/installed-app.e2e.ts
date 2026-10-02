import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

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

async function addCountrySession(context: BrowserContext) {
  const url = process.env.E2E_SUPABASE_URL;
  const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.E2E_COUNTRY_EMAIL;
  const password = process.env.E2E_COUNTRY_PASSWORD;

  if (!url || !publishableKey || !email || !password) return false;

  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(response.ok, "The configured country E2E account must be able to sign in").toBeTruthy();

  const session = await response.json();
  const projectRef = new URL(url).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await context.addInitScript(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: session },
  );
  return true;
}

async function readTabbarGeometry(page: Page) {
  return page.evaluate(() => {
    const visible = (node: Element) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const bar = [...document.querySelectorAll<HTMLElement>(".solaris-app-tabbar")].find(visible);
    if (!bar) return null;

    const material = bar.querySelector<HTMLElement>(".solaris-app-tabbar-material");
    const backdrop = bar.querySelector<HTMLElement>(".solaris-app-tabbar-backdrop");
    if (!material || !backdrop) return null;

    const rect = (element: HTMLElement) => {
      const value = element.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };

    const rootStyle = getComputedStyle(document.documentElement);
    return {
      bar: rect(bar),
      material: rect(material),
      backdrop: rect(backdrop),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport?.height ?? window.innerHeight,
      inlineDesignHeight: document.documentElement.style
        .getPropertyValue("--solaris-app-tabbar-height")
        .trim(),
      computedDesignHeight: rootStyle
        .getPropertyValue("--solaris-app-tabbar-height")
        .trim(),
      obstruction: Number.parseFloat(
        rootStyle.getPropertyValue("--solaris-app-bottom-obstruction"),
      ) || 0,
    };
  });
}

async function expectTabbarGeometry(page: Page, context: string) {
  const geometry = await readTabbarGeometry(page);
  expect(geometry, `${context} should expose measurable tab-bar geometry`).not.toBeNull();

  const value = geometry!;
  expect(value.inlineDesignHeight, `${context} must not write measured height back into its sizing token`).toBe("");
  expect(value.bar.height, `${context} tab bar must stay vertically bounded`).toBeLessThanOrEqual(110);
  expect(value.material.height, `${context} material must stay vertically bounded`).toBeLessThanOrEqual(110);
  expect(value.backdrop.height, `${context} glass must stay vertically bounded`).toBeLessThanOrEqual(110);
  expect(
    Math.abs(value.material.height - value.backdrop.height),
    `${context} glass must match the material bounds`,
  ).toBeLessThanOrEqual(2);
  expect(value.material.width, `${context} material must stay inside the viewport`).toBeLessThanOrEqual(
    value.viewportWidth + 2,
  );
  expect(value.bar.top, `${context} bottom navigation must remain in the lower viewport`).toBeGreaterThan(
    value.viewportHeight * 0.6,
  );
  expect(value.obstruction, `${context} measured bottom obstruction must stay bounded`).toBeLessThanOrEqual(128);
  expect(value.computedDesignHeight, `${context} should retain a CSS design-height token`).not.toBe("");
}

async function expectLastContentClearsTabbar(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(120);

  const geometry = await page.evaluate(() => {
    const visible = (node: Element) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const main = document.querySelector<HTMLElement>(".app-main[data-solaris-app-mode='true']");
    const tabbar = [...document.querySelectorAll<HTMLElement>(".solaris-app-tabbar")].find(visible);
    if (!main || !tabbar) return null;

    const candidates = [...main.querySelectorAll<HTMLElement>(
      "button, a[href], input:not([type='hidden']), select, textarea, [role='button']",
    )].filter(visible);
    const last = candidates.at(-1);
    if (!last) return null;

    return {
      lastBottom: last.getBoundingClientRect().bottom,
      tabbarTop: tabbar.getBoundingClientRect().top,
      label:
        last.getAttribute("aria-label") ||
        last.textContent?.trim().slice(0, 80) ||
        last.tagName.toLowerCase(),
    };
  });

  expect(geometry, `${route} should expose app content and a tab bar`).not.toBeNull();
  expect(
    geometry!.lastBottom,
    `${route} final control "${geometry!.label}" must remain above the tab bar`,
  ).toBeLessThanOrEqual(geometry!.tabbarTop - 2);
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
    await expectTabbarGeometry(page, route);
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

test("installed app keeps exactly one visible screen heading on app-owned screens", async ({ page }) => {
  for (const route of [
    "/",
    "/explore",
    "/results",
    "/countries",
    "/editions",
    "/shows",
    "/site-directory",
    "/settings",
  ]) {
    await expectInstalledShell(page, route);
    await expect(page.locator("h1:visible"), `${route} should expose one visible h1`).toHaveCount(1);
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

test("tab bar geometry stays bounded through drag, collapse and interrupted gestures", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "The destructive geometry stress test runs once at the representative iPhone width.",
  );

  const resizeLoopMessages: string[] = [];
  page.on("console", (message) => {
    if (/ResizeObserver loop/i.test(message.text())) resizeLoopMessages.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/ResizeObserver loop/i.test(error.message)) resizeLoopMessages.push(error.message);
  });

  await expectInstalledShell(page, "/explore");
  await expectTabbarGeometry(page, "initial Explore state");

  const active = page.locator(".solaris-app-tab[aria-current='page']");
  const activeBox = await active.boundingBox();
  expect(activeBox, "active tab should expose pointer geometry").not.toBeNull();

  const startX = activeBox!.x + activeBox!.width / 2;
  const startY = activeBox!.y + activeBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + Math.min(72, activeBox!.width * 0.8), startY, { steps: 5 });
  await page.waitForTimeout(60);
  await expectTabbarGeometry(page, "active drag state");
  await page.mouse.up();

  await page.waitForTimeout(360);
  await expectTabbarGeometry(page, "settled drag state");

  await page.evaluate(() => window.scrollTo(0, Math.min(900, document.documentElement.scrollHeight)));
  await page.waitForTimeout(320);
  await expectTabbarGeometry(page, "collapsed scroll state");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(240);
  await expectTabbarGeometry(page, "expanded scroll state");

  await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
  await page.waitForTimeout(80);
  await expectTabbarGeometry(page, "interrupted gesture reset");

  const stableHeights = await page.evaluate(async () => {
    const samples: number[] = [];
    for (let index = 0; index < 8; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const material = document.querySelector<HTMLElement>(".solaris-app-tabbar-material");
      if (material) samples.push(material.getBoundingClientRect().height);
    }
    return samples;
  });

  expect(stableHeights.length).toBeGreaterThanOrEqual(6);
  expect(
    Math.max(...stableHeights) - Math.min(...stableHeights),
    "settled tab-bar height must not grow frame over frame",
  ).toBeLessThanOrEqual(1.5);
  expect(resizeLoopMessages, "tab bar must not trigger ResizeObserver feedback loops").toEqual([]);

  await testInfo.attach("tabbar-geometry-stress.png", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
});

test("feature sheets trap focus, suppress app navigation and restore the trigger", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "Overlay interaction certification runs once at the representative iPhone width.",
  );

  await expectInstalledShell(page, "/explore");
  const trigger = page.getByRole("button", { name: "More" }).first();
  await trigger.click();

  const sheet = page.locator('[data-solaris-sheet][data-state="open"]').last();
  await expect(sheet).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-solaris-feature-overlay-open", "");
  await expect(page.locator("html")).toHaveAttribute("data-solaris-overlay-kind", "sheet");
  await expect(page.locator(".solaris-app-tabbar")).toHaveCSS("pointer-events", "none");

  const focusedInside = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('[data-solaris-sheet][data-state="open"]');
    return Boolean(sheet && document.activeElement && sheet.contains(document.activeElement));
  });
  expect(focusedInside, "opening a modal sheet must move focus inside it").toBe(true);

  await page.keyboard.press("Tab");
  const stillInside = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('[data-solaris-sheet][data-state="open"]');
    return Boolean(sheet && document.activeElement && sheet.contains(document.activeElement));
  });
  expect(stillInside, "tab focus must remain inside the modal sheet").toBe(true);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-solaris-feature-overlay-open", "");
  await expect(trigger).toBeFocused();
});

test("core installed screens reflow at 200 percent text on the narrow iPhone viewport", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-narrow-320",
    "Large-text reflow is certified at the narrow 320 CSS-pixel viewport.",
  );

  for (const route of ["/", "/explore", "/results", "/rules", "/site-directory"]) {
    await skipFirstRun(page);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.waitForTimeout(120);

    const geometry = await page.evaluate(() => ({
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      clippedControls: [...document.querySelectorAll<HTMLElement>(
        "button, a[href], input, select, textarea",
      )].flatMap((node) => {
        if (node.getClientRects().length === 0) return [];
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return [];
        const rect = node.getBoundingClientRect();
        const overflowX = node.scrollWidth - node.clientWidth;
        const overflowY = node.scrollHeight - node.clientHeight;
        return overflowX > 3 || overflowY > 3
          ? [`${node.tagName.toLowerCase()}:${Math.round(rect.width)}x${Math.round(rect.height)}`]
          : [];
      }),
    }));

    expect(geometry.overflow, `${route} must reflow at 200% text without horizontal scrolling`).toBeLessThanOrEqual(2);
    expect(geometry.clippedControls, `${route} must not clip control labels at 200% text`).toEqual([]);
  }
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
    const requestedToolbar = main?.dataset.solarisAppToolbar ?? "back";
    const rootTab = main?.dataset.solarisAppRootTab ?? "none";
    const screenId = main?.dataset.solarisScreenId ?? "";
    const searchMode = main?.dataset.solarisAppSearch ?? "";
    const offlinePolicy = main?.dataset.solarisAppOffline ?? "";
    const criticalTask = main?.dataset.solarisAppCriticalTask === "true";
    const tabbars = [...document.querySelectorAll(".solaris-app-tabbar")].filter(visible);
    const selectedTab = tabbars
      .flatMap((bar) => [...bar.querySelectorAll<HTMLElement>(".solaris-app-tab[aria-current='page']")])
      .find(visible)
      ?.getAttribute("aria-label")
      ?.toLowerCase() ?? null;
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
      requestedToolbar,
      requestedTabbar,
      tabbarCount: tabbars.length,
      rootTab,
      selectedTab,
      screenId,
      searchMode,
      offlinePolicy,
      criticalTask,
      websiteChrome: websiteChrome.map((node) => (node as HTMLElement).className),
      flagProblems,
      chromeControls,
      bootGuardStillPresent: document.documentElement.hasAttribute("data-solaris-app-boot"),
    };
  });

  expect(result.overflow, `${route} horizontal overflow in installed mode`).toBeLessThanOrEqual(2);
  expect(result.visibleH1, `${route} should expose exactly one visible h1`).toBe(1);
  expect(result.screenId, `${route} should expose a canonical screen contract`).not.toBe("");
  expect(["none", "home", "explore", "participate", "results", "me"]).toContain(result.rootTab);
  expect(["none", "global", "local"]).toContain(result.searchMode);
  expect(["ready", "readable", "online-required"]).toContain(result.offlinePolicy);
  if (result.requestedToolbar === "hidden") {
    expect(result.toolbarCount, `${route} should hide app toolbar`).toBe(0);
  } else {
    expect(result.toolbarCount, `${route} should expose one app toolbar`).toBe(1);
  }
  expect(result.websiteChrome, `${route} leaked website chrome`).toEqual([]);
  expect(result.flagProblems, `${route} has non-canonical flag frames`).toEqual([]);
  expect(result.chromeControls, `${route} has undersized app chrome controls`).toEqual([]);
  expect(result.bootGuardStillPresent, `${route} first-paint guard must clear after hydration`).toBe(false);

  if (result.requestedTabbar === "hidden") {
    expect(result.tabbarCount, `${route} should hide the global tab bar`).toBe(0);
    expect(result.selectedTab, `${route} hidden tabbar cannot expose a selected tab`).toBeNull();
  } else {
    expect(result.tabbarCount, `${route} should expose one global tab bar`).toBe(1);
    expect(
      result.selectedTab,
      `${route} selected global tab must agree with the canonical screen contract`,
    ).toBe(result.rootTab);
  }

  if (result.criticalTask) {
    expect(result.requestedTabbar, `${route} critical tasks must suppress global navigation`).toBe("hidden");
    expect(result.offlinePolicy, `${route} critical tasks cannot pretend to submit offline`).toBe("online-required");
  }

  if (result.requestedTabbar !== "hidden") {
    await expectNoBottomChromeCollision(page, route);
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

test("signed-in country workspace keeps one mobile navigation system", async ({ page, context }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "Authenticated installed-app coverage runs once at the representative iPhone width.",
  );

  await skipFirstRun(page);
  const configured = await addCountrySession(context);
  test.skip(!configured, "Country E2E credentials are not configured");

  for (const route of ["/my-solaris", "/my-solaris/account", "/my-solaris/tasks"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);

    await expect(page.locator("html")).toHaveAttribute("data-solaris-app", "");
    await expect(page.locator(".solaris-app-toolbar:visible")).toHaveCount(1);
    await expect(page.locator(".solaris-app-tabbar:visible")).toHaveCount(1);
    await expect(page.locator("[data-mysolaris-mobile-nav]:visible")).toHaveCount(0);
    await expect(page.locator(".site-nav:visible, .mobile-quick-nav:visible")).toHaveCount(0);
    await expect(page.locator("h1:visible"), `${route} should expose one visible screen heading`).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText("This page didn't load");
  }

  await expectLastContentClearsTabbar(page, "/my-solaris/account");
  await expectLastContentClearsTabbar(page, "/settings");
});

test("signed-in app settings keep notification configuration user-facing", async ({ page, context }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "Authenticated notification settings run once at the representative iPhone width.",
  );

  await skipFirstRun(page);
  const configured = await addCountrySession(context);
  test.skip(!configured, "Country E2E credentials are not configured");

  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => undefined);

  await expect(page.locator("body")).toContainText(/Notifications|Push notifications/i);
  await expect(page.locator("body")).not.toContainText(/VAPID|deployment secret|dispatch secret|not configured on this deployment/i);
  await expect(page.locator("[data-mysolaris-mobile-nav]:visible")).toHaveCount(0);
  await expect(page.locator("h1:visible")).toHaveCount(1);
});

test("installed app survives navigation, background-resume and offline-reconnect as one session", async ({ page, context }, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "Lifecycle journey runs once at the representative installed-iPhone viewport.",
  );

  await expectInstalledShell(page, "/explore");

  for (const name of ["Results", "Me", "Home", "Explore"]) {
    const destination = page.locator(".solaris-app-tab").filter({ hasText: name }).first();
    if (await destination.count()) {
      await destination.click();
      await page.waitForTimeout(80);
      await expectTabbarGeometry(page, `after ${name} tab navigation`);
    }
  }

  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect(page.locator("html")).toHaveAttribute("data-solaris-lifecycle", "background");

  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  await expect(page.locator("html")).toHaveAttribute("data-solaris-lifecycle", "foreground");
  await expectTabbarGeometry(page, "after app resume");

  await context.setOffline(true);
  await expect(page.locator("html")).toHaveAttribute("data-solaris-connectivity", "offline");
  await expect(page.locator("[data-solaris-app-connectivity='offline']")).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator("html")).toHaveAttribute("data-solaris-connectivity", "online", {
    timeout: 10_000,
  });
  await expectTabbarGeometry(page, "after offline reconnect");
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
