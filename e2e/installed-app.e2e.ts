import { readFileSync } from "node:fs";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { STATIC_PUBLIC_ROUTES } from "./audit-helpers";

// Playwright cannot emulate the CSS display-mode media feature for an installed
// PWA. JS matchMedia can be shimmed, but @media (display-mode: standalone)
// remains in browser mode. For installed-app E2E, inject an exact copy of the
// production app stylesheet with only the display-mode predicates neutralized.
// This keeps the assertions on the real production CSS declarations rather
// than maintaining a second test-only visual implementation.
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

async function launchInstalledApp(page: Page) {
  const launchRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/app-launch",
  );
  const startedAt = Date.now();

  // A parsing-time location.replace() deliberately supersedes the launch
  // document before its lifecycle completes. Trigger that full-document
  // navigation from a settled page instead of awaiting page.goto(), whose
  // navigation promise WebKit can keep attached to the superseded document.
  await page.evaluate(() => {
    window.setTimeout(() => window.location.assign("/app-launch"), 0);
  });
  await launchRequest;

  return startedAt;
}

async function openGlobalSearch(page: Page) {
  const allSearchTriggers = page.getByRole("button", { name: "Search Solaris Studio" });
  await expect(
    allSearchTriggers,
    "installed app should expose exactly one global Search trigger",
  ).toHaveCount(1);

  const toolbarSearch = page
    .locator(".solaris-app-toolbar")
    .getByRole("button", { name: "Search Solaris Studio" });
  await expect(toolbarSearch).toBeVisible();
  await toolbarSearch.click();
}

async function expectInstalledShell(
  page: Page,
  route: string,
  options: { tabbar?: "visible" | "hidden" } = {},
) {
  await skipFirstRun(page);
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await applyInstalledCssEmulation(page);
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
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }));

  expect(
    geometry.overflow,
    `${route} should not overflow in installed iOS mode`,
  ).toBeLessThanOrEqual(2);
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

    const rootStyle = getComputedStyle(document.documentElement);
    const obstructionValue = rootStyle.getPropertyValue("--solaris-app-bottom-obstruction").trim();
    const obstruction = Number.parseFloat(obstructionValue || "0");
    const spacer = main.querySelector<HTMLElement>("[data-solaris-app-bottom-spacer]");
    const spacerHeight = spacer ? spacer.getBoundingClientRect().height : 0;
    const barRect = bar.getBoundingClientRect();
    const children = [...main.children].filter(
      (node): node is HTMLElement =>
        node instanceof HTMLElement &&
        !node.hasAttribute("data-solaris-app-bottom-spacer") &&
        node.getClientRects().length > 0,
    );
    const last = children.at(-1);
    if (!last) return null;

    const rect = last.getBoundingClientRect();
    return {
      lastBottom: Math.round(rect.bottom),
      barTop: Math.round(barRect.top),
      obstruction: obstructionValue,
      obstructionPixels: Number.isFinite(obstruction) ? obstruction : 0,
      spacerHeight,
    };
  });

  if (collision) {
    expect(
      collision.spacerHeight,
      `${route} bottom spacer must reserve the measured tab-bar obstruction (${collision.obstruction})`,
    ).toBeGreaterThanOrEqual(collision.obstructionPixels);
    expect(
      collision.lastBottom,
      `${route} final content must clear the tab bar (obstruction ${collision.obstruction})`,
    ).toBeLessThanOrEqual(collision.barTop + 2);
  }
}

test.beforeEach(async ({ page }) => {
  await enableInstalledIosMode(page);
});

test.describe.configure({ retries: 0 });

test("installed app cold launch always leaves the intermediary launch route", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const startedAt = await launchInstalledApp(page);

  await expect(page).not.toHaveURL(/\/app-launch(?:[?#]|$)/, {
    timeout: 4_000,
  });
  expect(
    Date.now() - startedAt,
    "normal launch trampoline should leave well before the hard deadline",
  ).toBeLessThan(2_000);
  await expect(page.getByRole("heading", { name: "Opening your app…" })).toHaveCount(0);
});

test("cold launch preserves Results query, history semantics and post-restore persistence", async ({
  page,
}, testInfo) => {
  test.skip(
    !["ios-pwa-portrait", "ios-pwa-landscape"].includes(testInfo.project.name),
    "Exercise the complete transaction contract on canonical iOS portrait and landscape.",
  );

  const seedResultsNavigation = async () => {
    await page.evaluate(() => {
      const entry = {
        pathname: "/results/example",
        searchStr: "?view=jury",
        scrollY: 640,
        visitedAt: new Date().toISOString(),
      };
      localStorage.setItem(
        "solaris:app-navigation:v1",
        JSON.stringify({
          version: 1,
          activeTab: "results",
          tabs: { results: { current: entry, history: [entry] } },
        }),
      );
    });
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/explore", { waitUntil: "domcontentloaded" });
    await seedResultsNavigation();

    await launchInstalledApp(page);
    await expect(page).not.toHaveURL(/\/app-launch(?:[?#]|$)/, { timeout: 4_000 });
    await expect(page).toHaveURL(/\/results\/example\?view=jury$/);
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("solaris:app-launch-transaction:v1")))
      .toBeNull();

    await page.evaluate(() => window.history.back());
    await expect(page).toHaveURL(/\/explore(?:[?#]|$)/, { timeout: 5_000 });
    await expect(page).not.toHaveURL(/\/app-launch(?:[?#]|$)/);
  }

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("solaris:app-navigation:v1");
        return raw ? JSON.parse(raw).activeTab : null;
      }),
    )
    .toBe("explore");
});

test("signed-out and critical-route cold launches use canonical safe roots", async ({
  page,
}, testInfo) => {
  test.skip(
    !["ios-pwa-portrait", "ios-pwa-landscape"].includes(testInfo.project.name),
    "Exercise route safety on canonical iOS portrait and landscape.",
  );

  const setNavigation = async (activeTab: string, pathname: string) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ activeTab, pathname }) => {
        const entry = {
          pathname,
          searchStr: "",
          scrollY: 0,
          visitedAt: new Date().toISOString(),
        };
        localStorage.setItem(
          "solaris:app-navigation:v1",
          JSON.stringify({
            version: 1,
            activeTab,
            tabs: { [activeTab]: { current: entry, history: [entry] } },
          }),
        );
      },
      { activeTab, pathname },
    );
  };

  await setNavigation("me", "/my-solaris/account");
  await launchInstalledApp(page);
  await expect(page).toHaveURL(/\/auth(?:\?|$)/, { timeout: 4_000 });

  await setNavigation("participate", "/televoting");
  await launchInstalledApp(page);
  await expect(page).toHaveURL(/\/participate(?:\?|$)/, { timeout: 4_000 });
});

test("launch still exits when session storage cannot create a transaction", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "Storage-failure behavior is viewport-independent.",
  );
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "solaris:app-launch-transaction:v1") {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await launchInstalledApp(page);
  await expect(page).not.toHaveURL(/\/app-launch(?:[?#]|$)/, { timeout: 4_000 });
});

test("pre-hydration launch escape survives a client bundle that never starts", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "ios-pwa-portrait",
    "The hydration-independent launch watchdog is viewport-independent; exercise it once on canonical iOS portrait.",
  );

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.route("**/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (
      pathname.startsWith("/src/") ||
      pathname.startsWith("/@id/") ||
      pathname.startsWith("/@vite/") ||
      pathname.startsWith("/@react-refresh")
    ) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await launchInstalledApp(page);
  await expect(page).not.toHaveURL(/\/app-launch(?:[?#]|$)/, { timeout: 4_000 });
});

test("installed app shell survives representative navigation without duplicate chrome", async ({
  page,
}) => {
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

test("route contract owns the active global tab on help and directory screens", async ({
  page,
}) => {
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

test("installed app keeps exactly one visible screen heading on app-owned screens", async ({
  page,
}) => {
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
    await expect(page.locator("h1:visible"), `${route} should expose one visible h1`).toHaveCount(
      1,
    );
  }
});

test("directory titles stay geometrically centered in the toolbar", async ({ page }) => {
  for (const route of ["/countries", "/wiki", "/editions", "/shows", "/site-directory"]) {
    await expectInstalledShell(page, route);

    const toolbar = page.locator(".solaris-app-toolbar");
    const title = page.locator(".solaris-app-toolbar-context-title");
    await expect(title, `${route} should expose a toolbar title`).toHaveCount(1);
    await expect(page.locator(".solaris-app-large-title-flow")).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>(".solaris-app-toolbar");
      const title = document.querySelector<HTMLElement>(".solaris-app-toolbar-context-title");
      if (!toolbar || !title) return null;
      const toolbarRect = toolbar.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return {
        toolbarCenter: toolbarRect.left + toolbarRect.width / 2,
        titleCenter: titleRect.left + titleRect.width / 2,
        titleTop: titleRect.top,
        toolbarTop: toolbarRect.top,
      };
    });

    expect(geometry).not.toBeNull();
    expect(
      Math.abs(geometry!.toolbarCenter - geometry!.titleCenter),
      `${route} title should be centered to the viewport toolbar`,
    ).toBeLessThanOrEqual(1.5);
    expect(geometry!.titleTop).toBeGreaterThanOrEqual(geometry!.toolbarTop);
  }
});

test("global app search follows the full iOS VisualViewport during focus zoom and keyboard resize", async ({
  page,
}) => {
  await expectInstalledShell(page, "/explore");

  await openGlobalSearch(page);

  const dialog = page.locator(".solaris-app-search-dialog");
  const input = dialog.getByRole("searchbox", { name: "Search Solaris Studio" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-solaris-dialog-layout", "fullscreen");
  await expect(input).toBeVisible();
  await expect(dialog.locator("[cmdk-root]")).toHaveCount(1);

  const forbiddenCenteredUtilities = await dialog.evaluate((node) =>
    [...node.classList].filter((className) =>
      ["left-[50%]", "top-[50%]", "translate-x-[-50%]", "translate-y-[-50%]", "max-w-lg"].includes(
        className,
      ),
    ),
  );
  expect(
    forbiddenCenteredUtilities,
    "fullscreen app search must not inherit centered-dialog positioning utilities",
  ).toEqual([]);

  const appSearchSurface = dialog.locator("[data-solaris-search-field]");
  await expect(appSearchSurface).toHaveCount(1);

  const searchVisual = await appSearchSurface.evaluate((node) => {
    const input = node.querySelector<HTMLInputElement>("input[role='searchbox']");
    if (!input) return null;
    const shellStyle = getComputedStyle(node);
    const inputStyle = getComputedStyle(input);
    return {
      shellRadius: Number.parseFloat(shellStyle.borderTopLeftRadius || "0"),
      shellBackground: shellStyle.backgroundColor,
      inputBackground: inputStyle.backgroundColor,
      inputBackgroundImage: inputStyle.backgroundImage,
      inputBorder: Number.parseFloat(inputStyle.borderTopWidth || "0"),
      inputRadius: Number.parseFloat(inputStyle.borderTopLeftRadius || "0"),
      inputShadow: inputStyle.boxShadow,
    };
  });

  expect(searchVisual).not.toBeNull();
  expect(searchVisual!.shellRadius).toBeGreaterThan(0);
  expect(searchVisual!.shellBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(searchVisual!.inputBorder).toBe(0);
  expect(searchVisual!.inputRadius).toBe(0);
  expect(searchVisual!.inputShadow).toBe("none");
  expect(searchVisual!.inputBackgroundImage).toBe("none");
  expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(searchVisual!.inputBackground);

  const inputFont = await input.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize || "0"),
  );
  expect(inputFont).toBeGreaterThanOrEqual(16);

  const measure = async () =>
    dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        radius: Number.parseFloat(style.borderTopLeftRadius || "0"),
        transform: style.transform,
        translate: style.translate,
      };
    });

  const initial = await measure();
  expect(Math.abs(initial.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(initial.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(initial.width - initial.viewportWidth)).toBeLessThanOrEqual(1);
  expect(Math.abs(initial.height - initial.viewportHeight)).toBeLessThanOrEqual(1);
  expect(initial.radius).toBe(0);
  expect(initial.transform).toBe("none");
  expect(["none", "0px"]).toContain(initial.translate);

  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--solaris-visual-viewport-width", "342px");
    root.style.setProperty("--solaris-visual-viewport-height", "480px");
    root.style.setProperty("--solaris-visual-viewport-offset-left", "24px");
    root.style.setProperty("--solaris-visual-viewport-offset-top", "8px");
    root.style.setProperty("--solaris-visual-viewport-scale", "1.14");
    root.setAttribute("data-solaris-keyboard-open", "");
  });
  await page.waitForTimeout(40);

  const focusedViewport = await measure();
  expect(Math.abs(focusedViewport.left - 24)).toBeLessThanOrEqual(1);
  expect(Math.abs(focusedViewport.top - 8)).toBeLessThanOrEqual(1);
  expect(Math.abs(focusedViewport.width - 342)).toBeLessThanOrEqual(1);
  expect(Math.abs(focusedViewport.height - 480)).toBeLessThanOrEqual(1);
  expect(focusedViewport.radius).toBe(0);
  expect(focusedViewport.transform).toBe("none");
  expect(["none", "0px"]).toContain(focusedViewport.translate);

  await expect(page.locator(".solaris-app-tabbar")).toHaveCSS("pointer-events", "none");
});

test("global search preserves canonical structure while contextual focus color follows its route", async ({
  page,
}) => {
  await expectInstalledShell(page, "/countries");

  const canonicalSurface = page.locator("[data-solaris-search-field]");
  const canonicalInput = canonicalSurface.locator(".solaris-app-search-input");
  await canonicalInput.focus();
  await expect(canonicalInput).toBeFocused();

  const canonical = await canonicalSurface.evaluate((node) => {
    const input = node.querySelector<HTMLElement>(".solaris-app-search-input");
    const icon = node.querySelector<HTMLElement>(".solaris-app-search-icon");
    if (!input || !icon) return null;
    const shell = getComputedStyle(node);
    const inputStyle = getComputedStyle(input);
    const iconRect = icon.getBoundingClientRect();
    return {
      minHeight: shell.minHeight,
      radius: shell.borderTopLeftRadius,
      background: shell.backgroundColor,
      boxShadow: shell.boxShadow,
      accent: shell.getPropertyValue("--solaris-accent").trim(),
      paddingLeft: shell.paddingLeft,
      paddingRight: shell.paddingRight,
      gap: shell.columnGap,
      inputBackground: inputStyle.backgroundColor,
      inputRadius: inputStyle.borderTopLeftRadius,
      inputShadow: inputStyle.boxShadow,
      iconWidth: Math.round(iconRect.width),
      iconHeight: Math.round(iconRect.height),
    };
  });

  expect(canonical).not.toBeNull();

  await expectInstalledShell(page, "/explore");
  await openGlobalSearch(page);

  const command = page.locator(".solaris-app-search-dialog [data-solaris-search-field]");
  await expect(command).toHaveCount(1);
  const commandInput = command.locator(".solaris-app-search-input");
  await expect(commandInput).toBeFocused();

  const globalSearch = await command.evaluate((node) => {
    const input = node.querySelector<HTMLElement>(".solaris-app-search-input");
    const icon = node.querySelector<HTMLElement>(".solaris-app-search-icon");
    if (!input || !icon) return null;
    const shell = getComputedStyle(node);
    const inputStyle = getComputedStyle(input);
    const iconRect = icon.getBoundingClientRect();
    return {
      minHeight: shell.minHeight,
      radius: shell.borderTopLeftRadius,
      background: shell.backgroundColor,
      boxShadow: shell.boxShadow,
      accent: shell.getPropertyValue("--solaris-accent").trim(),
      paddingLeft: shell.paddingLeft,
      paddingRight: shell.paddingRight,
      gap: shell.columnGap,
      inputBackground: inputStyle.backgroundColor,
      inputRadius: inputStyle.borderTopLeftRadius,
      inputShadow: inputStyle.boxShadow,
      iconWidth: Math.round(iconRect.width),
      iconHeight: Math.round(iconRect.height),
    };
  });

  expect(globalSearch).not.toBeNull();

  // #449 intentionally makes the shared Search shell consume route/theme accent
  // context. Literal focus colors therefore are not the cross-route invariant;
  // geometry, input chrome and the presence of the focus treatment are.
  const structural = (visual: NonNullable<typeof canonical>) => ({
    minHeight: visual.minHeight,
    radius: visual.radius,
    paddingLeft: visual.paddingLeft,
    paddingRight: visual.paddingRight,
    gap: visual.gap,
    inputBackground: visual.inputBackground,
    inputRadius: visual.inputRadius,
    inputShadow: visual.inputShadow,
    iconWidth: visual.iconWidth,
    iconHeight: visual.iconHeight,
  });

  expect(structural(globalSearch!)).toEqual(structural(canonical!));
  for (const [label, visual] of [
    ["Countries", canonical!],
    ["Global", globalSearch!],
  ] as const) {
    expect(visual.background, `${label} Search focused background`).not.toBe("rgba(0, 0, 0, 0)");
    expect(visual.boxShadow, `${label} Search focused inset/ring treatment`).not.toBe("none");
    expect(visual.accent, `${label} Search must inherit a route/theme accent`).not.toBe("");
  }

  const shellRect = await command.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const dialog = node.closest<HTMLElement>(".solaris-app-search-dialog");
    const close = dialog?.querySelector<HTMLElement>("button");
    const closeRect = close?.getBoundingClientRect();
    return {
      right: rect.right,
      closeLeft: closeRect?.left ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(shellRect.right).toBeLessThanOrEqual(shellRect.closeLeft - 4);
});

test("installed directory search has exactly one visible field surface", async ({ page }) => {
  for (const route of ["/wiki", "/countries", "/site-directory"]) {
    await expectInstalledShell(page, route);

    const search = page.locator("[data-solaris-search-field]");
    await expect(search, `${route} should use the canonical search field`).toHaveCount(1);
    const input = search.locator("input[role='searchbox']");
    await expect(input).toHaveCount(1);

    const visual = await search.evaluate((node) => {
      const input = node.querySelector<HTMLInputElement>("input[role='searchbox']");
      if (!input) return null;
      const shellStyle = getComputedStyle(node);
      const inputStyle = getComputedStyle(input);
      return {
        shellRadius: Number.parseFloat(shellStyle.borderTopLeftRadius || "0"),
        shellBorder: Number.parseFloat(shellStyle.borderTopWidth || "0"),
        inputBackground: inputStyle.backgroundColor,
        inputBackgroundImage: inputStyle.backgroundImage,
        inputBorder: Number.parseFloat(inputStyle.borderTopWidth || "0"),
        inputRadius: Number.parseFloat(inputStyle.borderTopLeftRadius || "0"),
        inputShadow: inputStyle.boxShadow,
      };
    });

    expect(visual).not.toBeNull();
    expect(visual!.shellRadius).toBeGreaterThan(0);
    expect(visual!.shellBorder).toBe(0);
    expect(visual!.inputBorder).toBe(0);
    expect(visual!.inputRadius).toBe(0);
    expect(visual!.inputShadow).toBe("none");
    expect(visual!.inputBackgroundImage).toBe("none");
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(visual!.inputBackground);
  }
});

test("Editions and Shows use the canonical V6 mobile archive composition", async ({ page }) => {
  await expectInstalledShell(page, "/editions");
  await expect(page.locator(".solaris-app-card.solaris-app-edition-current")).toHaveCount(1);
  await expect(page.locator(".solaris-app-editions-v5")).toHaveCount(0);
  await expect(page.locator('[data-solaris-flat-list="editions"]')).toHaveCount(0);

  await expectInstalledShell(page, "/shows");
  await expect(page.locator(".solaris-app-shows-v6")).toHaveCount(0);
  await expect(page.locator("[data-solaris-show-list]")).toHaveCount(0);

  const canonicalShowStates =
    (await page.locator(".solaris-app-grouped-list").count()) +
    (await page.locator(".solaris-app-empty-state").count());
  expect(canonicalShowStates).toBeGreaterThan(0);
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
    [
      ...document.querySelectorAll<HTMLElement>(
        ".solaris-app-toolbar button, .solaris-app-toolbar a, .solaris-app-tabbar button, .solaris-app-tabbar a",
      ),
    ].flatMap((node) => {
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
  await applyInstalledCssEmulation(page);

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
  await applyInstalledCssEmulation(page);
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
    const main = document.querySelector<HTMLElement>(".app-main[data-solaris-app-mode='true']");
    const requestedToolbar = main?.dataset.solarisAppToolbar ?? "visible";
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
      if (radius < 4) problems.push(`corner radius ${radius}px`);
      if (imageStyle) {
        const imageRadius = Number.parseFloat(imageStyle.borderTopLeftRadius || "0");
        if (imageRadius < 4) problems.push(`image corner radius ${imageRadius}px`);
        if (imageStyle.objectFit !== "cover") {
          problems.push(`object-fit ${imageStyle.objectFit}`);
        }
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
      websiteChrome: websiteChrome.map((node) => (node as HTMLElement).className),
      flagProblems,
      chromeControls,
      bootGuardStillPresent: document.documentElement.hasAttribute("data-solaris-app-boot"),
    };
  });

  expect(result.overflow, `${route} horizontal overflow in installed mode`).toBeLessThanOrEqual(2);
  expect(result.visibleH1, `${route} should expose exactly one visible h1`).toBe(1);
  if (result.requestedToolbar === "hidden") {
    expect(result.toolbarCount, `${route} should hide the app toolbar`).toBe(0);
  } else {
    expect(result.toolbarCount, `${route} should expose one app toolbar`).toBe(1);
  }
  expect(result.websiteChrome, `${route} leaked website chrome`).toEqual([]);
  expect(result.flagProblems, `${route} has non-canonical flag frames`).toEqual([]);
  expect(result.chromeControls, `${route} has undersized app chrome controls`).toEqual([]);
  expect(
    result.bootGuardStillPresent,
    `${route} first-paint guard must clear after hydration`,
  ).toBe(false);

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
    const routes = [...STATIC_PUBLIC_ROUTES].sort().filter((_, index) => index % 4 === shard);

    for (const route of routes) {
      try {
        await test.step(route, () => auditInstalledRoute(page, route, testInfo));
      } catch (error) {
        failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    expect(failures, "Every static public route should preserve installed-app invariants").toEqual(
      [],
    );
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
