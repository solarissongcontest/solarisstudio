import { expect, test } from "@playwright/test";

import { prepareNavbarInstalledContext } from "./navbar-local-rollout";

test.describe.configure({ retries: 0 });

test(
  "installed app shell survives representative navigation without duplicate chrome: selected lens visibly engages, drags and snaps",
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

    const nav = page.locator("[data-v3-liquid-tabbar]");
    const material = nav.locator(".v3-liquid-tabbar__material");
    const lens = nav.locator(".v3-liquid-tabbar__lens");
    const me = nav.getByRole("link", { name: /^Me(?:,|$)/ });
    await expect(nav).toBeVisible();
    await expect(me).toHaveAttribute("aria-current", "page");

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

    await page.mouse.move(startX - 72, startY, { steps: 4 });
    const draggedLens = await lens.boundingBox();
    expect(draggedLens).not.toBeNull();
    if (!draggedLens) return;
    expect(draggedLens.x).toBeLessThan(heldLens.x - 20);
    expect(draggedLens.width).toBeGreaterThanOrEqual(heldLens.width);

    await page.mouse.up();
    await expect(page).toHaveURL(/\/results(?:[/?#]|$)/);
    await expect(material).toHaveAttribute("data-held", "false");
    await expect(nav.getByRole("link", { name: /^Results(?:,|$)/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await expect
      .poll(async () => {
        const selected = await nav
          .locator('[data-v3-tab-index][aria-current="page"]')
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

    await context.close();
  },
);