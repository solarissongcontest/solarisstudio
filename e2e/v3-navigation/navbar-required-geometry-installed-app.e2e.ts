import { expect, test } from "@playwright/test";

import { applyNavbarInstalledCssEmulation, prepareNavbarInstalledContext } from "./navbar-local-rollout";

const VIEWPORTS = [
  { width: 375, height: 844 },
  { width: 390, height: 844 },
  { width: 393, height: 844 },
  { width: 430, height: 844 },
] as const;

test(
  "installed app shell survives representative navigation without duplicate chrome: records explicit required authoritative navbar and page-width geometry",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "One isolated WebKit installed-app context records the canonical mobile viewport matrix.",
    );

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const { baseURL } = await prepareNavbarInstalledContext(context);
    const page = await context.newPage();
    await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
    await applyNavbarInstalledCssEmulation(page);
    const nav = page.locator(".solaris-app-tabbar");
    await expect(nav).toBeVisible();
    await expect(page.locator("[data-v3-liquid-tabbar]:visible")).toHaveCount(0);

    const evidence = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(nav).toBeVisible();
      await expect(nav).toHaveAttribute("data-collapsed", "false");

      const measured = await page.evaluate(() => {
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
        const outer = document.querySelector<HTMLElement>(".solaris-app-tabbar");
        const material = outer?.querySelector<HTMLElement>(".solaris-app-tabbar-material") ?? null;
        const lens = outer?.querySelector<HTMLElement>(".solaris-app-tab-indicator") ?? null;
        const active = outer?.querySelector<HTMLElement>('[data-app-tab-index][aria-current="page"]') ?? null;
        const items = outer
          ? Array.from(outer.querySelectorAll<HTMLElement>("[data-app-tab-index]"))
          : [];
        if (!outer || !material || !lens || !active || items.length !== 5) return null;
        const outerRect = rect(outer);
        const materialRect = rect(material);
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
          outerBar: outerRect,
          navbar: materialRect,
          lens: rect(lens),
          selectedItem: rect(active),
          touchTargets: items.map(rect),
          bottomOffset: window.innerHeight - materialRect.bottom,
        };
      });

      expect(measured, `${viewport.width}x${viewport.height} geometry must render`).not.toBeNull();
      if (!measured) continue;
      const expectedWidth = Math.min(viewport.width - 48, 342);
      expect(measured.documentScrollWidth).toBeLessThanOrEqual(measured.documentClientWidth + 2);
      expect(measured.bodyScrollWidth).toBeLessThanOrEqual(measured.documentClientWidth + 2);
      expect(measured.navbar.width).toBeGreaterThan(expectedWidth - 3);
      expect(measured.navbar.width).toBeLessThan(expectedWidth + 3);
      expect(measured.navbar.height).toBeGreaterThanOrEqual(63);
      expect(measured.navbar.height).toBeLessThanOrEqual(65);
      expect(measured.navbar.left).toBeGreaterThanOrEqual(23);
      expect(
        Math.abs(measured.navbar.left - (measured.viewportWidth - measured.navbar.width) / 2),
      ).toBeLessThanOrEqual(2);
      expect(measured.bottomOffset).toBeGreaterThanOrEqual(9);
      expect(Math.abs(measured.lens.centerX - measured.selectedItem.centerX)).toBeLessThanOrEqual(3);
      expect(measured.lens.width).toBeLessThan(measured.selectedItem.width * 0.86);
      expect(measured.lens.width).toBeGreaterThan(measured.selectedItem.width * 0.74);
      measured.touchTargets.forEach((target) => {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      });
      evidence.push(measured);
    }

    expect(evidence).toHaveLength(VIEWPORTS.length);
    await testInfo.attach("navbar-required-geometry.json", {
      body: Buffer.from(
        `${JSON.stringify(
          {
            candidateSha: process.env.GITHUB_SHA ?? null,
            owner: "src/components/app/AppTabBar.tsx + src/styles/app-shell.css",
            project: testInfo.project.name,
            measurements: evidence,
          },
          null,
          2,
        )}\n`,
      ),
      contentType: "application/json",
    });

    await context.close();
  },
);