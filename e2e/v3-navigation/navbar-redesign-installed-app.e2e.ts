import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { applyNavbarInstalledCssEmulation, prepareNavbarInstalledContext } from "./navbar-local-rollout";

type NavGeometry = {
  viewportWidth: number;
  viewportHeight: number;
  overflow: number;
  bar: Rect;
  material: Rect;
  lens: Rect;
  activeItem: Rect | null;
  items: Rect[];
  bottomGap: number;
  obstruction: number;
  appMainPaddingBottom: number | null;
};

type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
};

const VIEWPORTS = [
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 393, height: 844 },
  { width: 430, height: 844 },
] as const;

const ROUTES = [
  { label: "Home", path: "/" },
  { label: "Explore", path: "/explore" },
  { label: "Edition", path: "/editions/ssc22" },
  { label: "Rules", path: "/rules" },
  { label: "Results", path: "/results" },
  { label: "Me", path: "/my-solaris/account" },
] as const;

async function readGeometry(page: Page): Promise<NavGeometry | null> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".solaris-app-tabbar");
    const material = bar?.querySelector<HTMLElement>(".solaris-app-tabbar-material") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".solaris-app-tab-indicator") ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-app-tab-index]"))
      : [];
    const activeItem =
      bar?.querySelector<HTMLElement>('[data-app-tab-index][aria-current="page"]') ?? null;
    if (!bar || !material || !lens || items.length !== 5) return null;

    const rect = (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
        centerX: bounds.left + bounds.width / 2,
      };
    };
    const materialRect = rect(material);
    const rootStyle = getComputedStyle(document.documentElement);
    const appMain = document.querySelector<HTMLElement>(".app-main[data-solaris-app-mode='true']");

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      bar: rect(bar),
      material: materialRect,
      lens: rect(lens),
      activeItem: activeItem ? rect(activeItem) : null,
      items: items.map(rect),
      bottomGap: window.innerHeight - materialRect.bottom,
      obstruction: Number.parseFloat(
        rootStyle.getPropertyValue("--solaris-app-bottom-obstruction") ||
          rootStyle.getPropertyValue("--solaris-bottom-obstruction") ||
          "0",
      ),
      appMainPaddingBottom: appMain
        ? Number.parseFloat(getComputedStyle(appMain).paddingBottom || "0")
        : null,
    };
  });
}

async function readStableGeometry(page: Page, label: string): Promise<NavGeometry> {
  await expect
    .poll(async () => {
      const geometry = await readGeometry(page);
      return Boolean(
        geometry &&
          geometry.material.width > 0 &&
          geometry.material.height > 0 &&
          geometry.activeItem,
      );
    }, { message: `${label} navbar should settle after route-shell hydration` })
    .toBe(true);

  const geometry = await readGeometry(page);
  expect(geometry, `${label} navbar geometry should render`).not.toBeNull();
  if (!geometry) throw new Error(`${label} navbar geometry disappeared after settling`);
  return geometry;
}

function expectRedesignedGeometry(geometry: NavGeometry, viewportWidth: number) {
  const expectedMaterialWidth = Math.min(viewportWidth - 28, 414);

  expect(geometry.overflow).toBeLessThanOrEqual(2);
  expect(geometry.material.width).toBeGreaterThan(expectedMaterialWidth - 3);
  expect(geometry.material.width).toBeLessThan(expectedMaterialWidth + 3);
  expect(geometry.material.height).toBeGreaterThanOrEqual(63);
  expect(geometry.material.height).toBeLessThanOrEqual(65);
  expect(geometry.material.left).toBeGreaterThanOrEqual(13);
  expect(
    Math.abs(geometry.material.left - (geometry.viewportWidth - geometry.material.width) / 2),
  ).toBeLessThanOrEqual(2);
  expect(geometry.bottomGap).toBeGreaterThanOrEqual(9);
  expect(geometry.bottomGap).toBeLessThanOrEqual(64);
  expect(geometry.obstruction).toBeGreaterThan(geometry.material.height + geometry.bottomGap - 2);

  expect(geometry.activeItem).not.toBeNull();
  if (geometry.activeItem) {
    expect(geometry.lens.width).toBeGreaterThan(geometry.activeItem.width * 0.74);
    expect(geometry.lens.width).toBeLessThan(geometry.activeItem.width * 0.86);
    expect(Math.abs(geometry.lens.centerX - geometry.activeItem.centerX)).toBeLessThanOrEqual(3);
  }
  expect(geometry.lens.height).toBeLessThan(geometry.material.height * 0.78);
  expect(geometry.lens.height).toBeGreaterThan(40);

  for (const item of geometry.items) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }

  if (geometry.appMainPaddingBottom != null) {
    expect(geometry.appMainPaddingBottom).toBeGreaterThanOrEqual(geometry.obstruction + 10);
  }
}

async function assertAuthoritativeNavbar(page: Page) {
  const nav = page.locator(".solaris-app-tabbar");
  await expect(nav).toBeVisible();
  await expect(nav.locator(".solaris-app-tabbar-material")).toBeVisible();
  await expect(nav.locator("[data-app-tab-index]")).toHaveCount(5);
  await expect(nav.locator('[data-app-tab-index][aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator(".solaris-app-tab-label").first()).toBeHidden();
  await expect(page.locator("[data-v3-liquid-tabbar]:visible")).toHaveCount(0);
  return nav;
}

async function attachNavbar(page: Page, testInfo: TestInfo, name: string) {
  const nav = await assertAuthoritativeNavbar(page);
  await testInfo.attach(`${name}.png`, {
    body: await nav.screenshot({ animations: "disabled", caret: "hide" }),
    contentType: "image/png",
  });
}

async function attachGeometry(testInfo: TestInfo, name: string, geometry: NavGeometry) {
  await testInfo.attach(`${name}-geometry.json`, {
    body: Buffer.from(`${JSON.stringify(geometry, null, 2)}\n`),
    contentType: "application/json",
  });
}

test.describe.configure({ retries: 0 });

test(
  "installed app shell survives representative navigation without duplicate chrome: authoritative production navbar geometry is stable across widths and routes",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "One isolated WebKit installed-app context drives the explicit width/route matrix itself.",
    );

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const { baseURL } = await prepareNavbarInstalledContext(context);
    const page = await context.newPage();

    await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
    await applyNavbarInstalledCssEmulation(page);
    await assertAuthoritativeNavbar(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      const nav = await assertAuthoritativeNavbar(page);
      await expect(nav).toHaveAttribute("data-collapsed", "false");
      const geometry = await readStableGeometry(page, `${viewport.width}px`);
      expectRedesignedGeometry(geometry, viewport.width);
      await attachGeometry(testInfo, `navbar-${viewport.width}x${viewport.height}`, geometry);
      await attachNavbar(page, testInfo, `navbar-${viewport.width}x${viewport.height}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    let reference: NavGeometry | null = null;

    for (const route of ROUTES) {
      const response = await page.goto(`${baseURL}${route.path}`, { waitUntil: "domcontentloaded" });
      await applyNavbarInstalledCssEmulation(page);
      expect(response?.status(), `${route.label} should load`).toBeLessThan(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      await assertAuthoritativeNavbar(page);

      const geometry = await readStableGeometry(page, route.label);
      expectRedesignedGeometry(geometry, 390);
      await attachGeometry(testInfo, `navbar-390x844-${route.label.toLowerCase()}`, geometry);

      if (!reference) reference = geometry;
      else {
        expect(Math.abs(geometry.material.width - reference.material.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.material.height - reference.material.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.material.left - reference.material.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.bottomGap - reference.bottomGap)).toBeLessThanOrEqual(1);
      }

      await attachNavbar(page, testInfo, `navbar-390x844-${route.label.toLowerCase()}`);
    }

    await context.close();
  },
);
