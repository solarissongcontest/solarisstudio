import { expect, test } from "@playwright/test";

import { prepareNavbarInstalledContext } from "./navbar-local-rollout";

/**
 * The installed-app test project's isolated WebKit and Supabase fixture can
 * also probe ordinary web mode, provided both standalone detectors are
 * explicitly disabled before hydration. No hosted backend is ever accessed.
 */
test(
  "installed app shell survives representative navigation without duplicate chrome: browser V3 Records uses website sections instead of an app dock",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "The existing isolated WebKit project owns this three-experience browser probe.",
    );

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const { baseURL } = await prepareNavbarInstalledContext(context, {
      experience: "web",
    });

    // A single fixture script owns both the auth session and browser runtime.
    // Separate addInitScript calls have undefined evaluation order in Playwright.
    const page = await context.newPage();
    await page.goto(`${baseURL}/records`, { waitUntil: "domcontentloaded" });

    // The Records route deliberately mounts V3RecordsGate only in installed
    // app mode. Ordinary browser visitors receive the established website
    // shell until the separate Public Results web cutover is authorized.
    // Never claim this legacy browser route mounts V3AppShell.
    const webHeader = page.locator("header.site-nav");
    await expect(webHeader).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Records", exact: true }).first()).toBeVisible();
    await expect(page.locator('[data-v3-shell-experience="web"]')).toHaveCount(0);

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await expect(webHeader).toBeVisible();
      await expect(page.locator(".solaris-app-tabbar:visible")).toHaveCount(0);
      await expect(page.locator("[data-v3-liquid-tabbar]:visible")).toHaveCount(0);
      // A normal website header stays in document flow and never expands
      // beyond the usable viewport when mobile browser chrome changes.
      const headerWidth = await webHeader.evaluate((header) => ({
        width: header.getBoundingClientRect().width,
        viewport: document.documentElement.clientWidth,
      }));
      expect(headerWidth.width).toBeLessThanOrEqual(headerWidth.viewport + 2);
    }

    // Real browser Back/Forward navigation is part of the web experience.
    await page.setViewportSize({ width: 390, height: 844 });
    await webHeader.getByRole("link", { name: "Solaris Studio home" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/");
    await page.goBack();
    await expect.poll(() => new URL(page.url()).pathname).toMatch(new RegExp("^/records/?$"));
    await expect(page.locator("header.site-nav")).toBeVisible();
    await expect(page.locator(".solaris-app-tabbar:visible")).toHaveCount(0);

    await context.close();
  },
);
