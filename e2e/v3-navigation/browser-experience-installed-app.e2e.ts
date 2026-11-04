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
    const { baseURL } = await prepareNavbarInstalledContext(context);

    // The shared local fixture sets navigator.standalone=true to exercise the
    // installed app. Override it in a later init script for *browser mode*.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        value: false,
      });
      const originalMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) => {
        if (query !== "(display-mode: standalone)") return originalMatchMedia(query);
        return {
          matches: false,
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          dispatchEvent: () => false,
        } as MediaQueryList;
      }) as typeof window.matchMedia;
    });

    const page = await context.newPage();
    await page.goto(`${baseURL}/records`, { waitUntil: "domcontentloaded" });
    const shell = page.locator('[data-v3-shell-experience="web"]');
    await expect(shell).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".solaris-app-tabbar:visible")).toHaveCount(0);
    await expect(page.locator("[data-v3-liquid-tabbar]:visible")).toHaveCount(0);

    const web = shell.locator('[data-v3-web-section-navigation]');
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(web).toBeVisible();
      await expect(web.getByRole("link", { name: "Results", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      const measurements = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>("[data-v3-web-section-navigation]");
        const first = nav?.querySelector<HTMLElement>("a");
        if (!nav || !first) return null;
        return {
          position: getComputedStyle(nav).position,
          minimumHitHeight: first.getBoundingClientRect().height,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        };
      });
      expect(measurements).not.toBeNull();
      expect(measurements?.position).not.toBe("fixed");
      expect(measurements?.minimumHitHeight).toBeGreaterThanOrEqual(44);
      expect(measurements?.scrollWidth).toBeLessThanOrEqual((measurements?.clientWidth ?? 0) + 2);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(web).toBeHidden();
    await expect(shell.locator(".v3-desktop-primary-nav")).toBeVisible();
    await expect(page.locator(".solaris-app-tabbar:visible")).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(web).toBeVisible();
    await web.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore\/?$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/records\/?$/);
    await expect(page.locator('[data-v3-shell-experience="web"]')).toBeVisible();

    await context.close();
  },
);
