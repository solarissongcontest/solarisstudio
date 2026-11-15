import { expect, test } from "@playwright/test";

import { applyNavbarInstalledCssEmulation, prepareNavbarInstalledContext } from "./navbar-local-rollout";

test.describe.configure({ retries: 0 });

test(
  "installed app shell survives representative navigation without duplicate chrome: authoritative selected lens visibly engages, drags and snaps",
  async ({ browser }, testInfo) => {
    test.skip(
      testInfo.project.name !== "ios-pwa-portrait",
      "The direct-manipulation probe runs once in the isolated WebKit installed-app context.",
    );

    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: "no-preference",
    });
    const { baseURL } = await prepareNavbarInstalledContext(context);
    const page = await context.newPage();
    await page.goto(`${baseURL}/my-solaris/account`, { waitUntil: "domcontentloaded" });
    await applyNavbarInstalledCssEmulation(page);

    const nav = page.locator(".solaris-app-tabbar");
    const material = nav.locator(".solaris-app-tabbar-material");
    const lens = nav.locator(".solaris-app-tab-indicator");
    const me = nav.getByRole("link", { name: /^Me(?:,|$)/ });
    await expect(page.locator('[data-v3-account-settings-screen="account"]')).toBeVisible();
    await expect(nav).toBeVisible();
    await expect(lens).toBeVisible();
    await expect(page.locator("[data-v3-liquid-tabbar]:visible")).toHaveCount(0);
    await expect(me).toHaveAttribute("aria-current", "page");

    // WebKit can expose the visible pre-hydration element for one frame while
    // React replaces the route shell. Require stable rendered geometry before
    // sampling the lens rather than racing that owner handoff.
    await expect
      .poll(async () => (await lens.boundingBox())?.width ?? 0)
      .toBeGreaterThan(0);
    await expect
      .poll(async () => (await me.boundingBox())?.width ?? 0)
      .toBeGreaterThan(0);

    const restingLens = await lens.boundingBox();
    const meBox = await me.boundingBox();
    expect(restingLens).not.toBeNull();
    expect(meBox).not.toBeNull();
    if (!restingLens || !meBox) return;

    const startX = meBox.x + meBox.width / 2;
    const startY = meBox.y + meBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(420);

    await expect(material).toHaveAttribute("data-held", "true");
    const heldLens = await lens.boundingBox();
    expect(heldLens).not.toBeNull();
    if (!heldLens) return;
    expect(heldLens.width).toBeGreaterThan(restingLens.width * 1.1);
    expect(heldLens.height).toBeGreaterThan(restingLens.height * 1.08);

    await testInfo.attach("navbar-390-held.png", {
      body: await nav.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    await page.mouse.move(startX - 72, startY, { steps: 4 });
    const draggedLens = await lens.boundingBox();
    expect(draggedLens).not.toBeNull();
    if (!draggedLens) return;
    expect(draggedLens.x).toBeLessThan(heldLens.x - 20);
    expect(draggedLens.width).toBeGreaterThanOrEqual(heldLens.width);

    await testInfo.attach("navbar-390-dragged.png", {
      body: await nav.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    await page.mouse.up();
    await expect(page).toHaveURL(/\/results(?:[/?#]|$)/);
    await expect(nav).toBeVisible();
    await expect(page.locator("[data-v3-liquid-tabbar]:visible")).toHaveCount(0);
    await expect(material).toHaveAttribute("data-held", "false");
    await expect(nav.getByRole("link", { name: /^Results(?:,|$)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await expect
      .poll(async () => {
        const selected = await nav
          .locator('[data-app-tab-index][aria-current="page"]')
          .boundingBox();
        const snapped = await lens.boundingBox();
        if (!selected || !snapped) return Number.POSITIVE_INFINITY;
        return Math.abs(
          snapped.x + snapped.width / 2 - (selected.x + selected.width / 2),
        );
      })
      .toBeLessThanOrEqual(3);

    await testInfo.attach("navbar-390-engaged-dragged-snapped.png", {
      body: await nav.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    // A soft keyboard or feature sheet can interrupt a held pointer without
    // dispatching pointerup on its original link. The dock must release capture,
    // cancel the lens and allow the next tap/keyboard activation.
    const activeResults = nav.getByRole("link", { name: /^Results(?:,|$)/ });
    const resultBox = await activeResults.boundingBox();
    expect(resultBox).not.toBeNull();
    if (resultBox) {
      await page.mouse.move(resultBox.x + resultBox.width / 2, resultBox.y + resultBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(420);
      await expect(material).toHaveAttribute("data-held", "true");

      await page.evaluate(() => document.documentElement.setAttribute("data-solaris-keyboard-open", "true"));
      await expect(material).toHaveAttribute("data-held", "false");
      await page.evaluate(() => document.documentElement.removeAttribute("data-solaris-keyboard-open"));
      await page.mouse.up();
      await expect(page).toHaveURL(/\/results(?:[/?#]|$)/);

      // A cancelled drag must never eat a later legitimate tab click.
      await nav.getByRole("link", { name: /^Explore(?:,|$)/ }).click();
      await expect(page).toHaveURL(/\/explore(?:[/?#]|$)/);
    }

    await context.close();
  },
);
