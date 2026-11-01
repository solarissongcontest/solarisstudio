import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { prepareNavbarInstalledContext } from "./navbar-local-rollout";

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
  screenPaddingBottom: number | null;
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
    const bar = document.querySelector<HTMLElement>("[data-v3-liquid-tabbar]");
    const material = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__material") ?? null;
    const lens = bar?.querySelector<HTMLElement>(".v3-liquid-tabbar__lens") ?? null;
    const items = bar
      ? Array.from(bar.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
      : [];
    const activeItem =
      bar?.querySelector<HTMLElement>('[data-v3-tab-index][aria-current="page"]') ?? null;
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
    const barRect = rect(bar);
    const rootStyle = getComputedStyle(document.documentElement);
    const screen = document.querySelector<HTMLElement>(".v3-screen");

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      bar: barRect,
      material: rect(material),
      lens: rect(lens),
      activeItem: activeItem ? rect(activeItem) : null,
      items: items.map(rect),
      bottomGap: window.innerHeight - barRect.bottom,
      obstruction: Number.parseFloat(
        rootStyle.getPropertyValue("--v3-bottom-obstruction") || "0",
      ),
      screenPaddingBottom: screen
        ? Number.parseFloat(getComputedStyle(screen).paddingBottom || "0")
        : null,
    };
  });
}

function expectRedesignedGeometry(geometry: NavGeometry, expectedWidth: number) {
  const expectedMaterialWidth = Math.min(expectedWidth - 28, 414);

  expect(geometry.overflow).toBeLessThanOrEqual(2);
  expect(geometry.material.width).toBeGreaterThan(expectedMaterialWidth - 3);
  expect(geometry.material.width).toBeLessThan(expectedMaterialWidth + 3);
  expect(geometry.material.height).toBeGreaterThanOrEqual(63);
  expect(geometry.material.height).toBeLessThanOrEqual(65);
  expect(geometry.material.left).toBeGreaterThanOrEqual(12);
  expect(
    Math.abs(geometry.material.left - (geometry.viewportWidth - geometry.material.width) / 2),
  ).toBeLessThanOrEqual(2);
  expect(geometry.bottomGap).toBeGreaterThanOrEqual(8);
  expect(geometry.bottomGap).toBeLessThanOrEqual(64);
  expect(geometry.obstruction).toBeGreaterThan(geometry.material.height + geometry.bottomGap);

  expect(geometry.activeItem).not.toBeNull();
  if (geometry.activeItem) {
    expect(geometry.lens.width).toBeGreaterThan(geometry.activeItem.width * 0.76);
    expect(geometry.lens.width).toBeLessThan(geometry.activeItem.width * 0.91);
    expect(Math.abs(geometry.lens.centerX - geometry.activeItem.centerX)).toBeLessThanOrEqual(3);
  }
  expect(geometry.lens.height).toBeLessThan(geometry.material.height * 0.78);
  expect(geometry.lens.height).toBeGreaterThan(40);

  for (const item of geometry.items) {
    expect(item.width).toBeGreaterThanOrEqual(44);
    expect(item.height).toBeGreaterThanOrEqual(44);
  }

  if (geometry.screenPaddingBottom != null) {
    expect(geometry.screenPaddingBottom).toBeGreaterThanOrEqual(geometry.obstruction + 10);
  }
}

async function attachNavbar(page: Page, testInfo: TestInfo, name: string) {
  const nav = page.locator("[data-v3-liquid-tabbar]");
  await expect(nav).toBeVisible();
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
  "installed app shell survives representative navigation without duplicate chrome: redesigned navbar geometry is stable across widths and routes",
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
    await expect(page.locator("[data-v3-liquid-tabbar]")).toBeVisible();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator("[data-v3-liquid-tabbar]")).toHaveAttribute(
        "data-collapsed",
        "false",
      );
      const geometry = await readGeometry(page);
      expect(geometry, `${viewport.width}px navbar geometry should render`).not.toBeNull();
      if (geometry) {
        expectRedesignedGeometry(geometry, viewport.width);
        await attachGeometry(testInfo, `navbar-${viewport.width}x${viewport.height}`, geometry);
      }
      await attachNavbar(page, testInfo, `navbar-${viewport.width}x${viewport.height}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    let reference: NavGeometry | null = null;

    for (const route of ROUTES) {
      const response = await page.goto(`${baseURL}${route.path}`, { waitUntil: "domcontentloaded" });
      expect(response?.status(), `${route.label} should load`).toBeLessThan(400);
      await page.evaluate(() => window.scrollTo(0, 0));
      const nav = page.locator("[data-v3-liquid-tabbar]");
      await expect(nav, `${route.label} must use the real V3 navbar`).toBeVisible();
      await expect(nav.locator("[data-v3-tab-index]")).toHaveCount(5);
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);

      const geometry = await readGeometry(page);
      expect(geometry, `${route.label} navbar geometry should render`).not.toBeNull();
      if (!geometry) continue;
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