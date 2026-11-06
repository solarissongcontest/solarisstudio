import { expect, test } from "@playwright/test";

// These are ordinary website browser projects, not the installed PWA experience.
// They run against the existing CI's explicitly loopback-only Supabase audit server.
test("mobile browser section navigation supports keyboard disclosure, Escape, and route reset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "Representative mobile browser behavior");

  await page.goto("/results", { waitUntil: "domcontentloaded" });

  const nav = page.locator("nav.public-mobile-section-nav");
  const trigger = nav.locator(".public-mobile-section-trigger");
  const panel = nav.locator(".public-mobile-section-panel");

  await expect(nav).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  const controlledId = await trigger.getAttribute("aria-controls");
  expect(controlledId).toBeTruthy();
  await expect(panel).toHaveAttribute("id", controlledId!);

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  const scorechartsLink = panel.getByRole("link", { name: /Scorecharts/i });
  await expect(scorechartsLink).toBeVisible();
  await scorechartsLink.focus();
  await page.keyboard.press("Escape");

  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  await trigger.click();
  await scorechartsLink.click();
  await expect(page).toHaveURL(/\/scorecharts\/?(?:[?#].*)?$/);
  await expect(nav.locator(".public-mobile-section-trigger")).toHaveAttribute("aria-expanded", "false");

  // Back/forward must not carry an expanded disclosure into another route.
  await nav.locator(".public-mobile-section-trigger").click();
  await expect(nav.locator(".public-mobile-section-trigger")).toHaveAttribute("aria-expanded", "true");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/results\/?(?:[?#].*)?$/);
  await expect(nav.locator(".public-mobile-section-trigger")).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();
});

test("tablet browser keeps Advanced destinations keyboard-accessible with readable touch targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "One deterministic tablet resize from web mode");

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/results", { waitUntil: "domcontentloaded" });

  await expect(page.locator(".public-mobile-section-nav")).toBeHidden();
  const sidebar = page.locator(".public-site-sidebar");
  await expect(sidebar).toBeVisible();

  const advanced = sidebar.locator("nav > details");
  const summary = advanced.locator("summary");
  await expect(advanced).toBeVisible();
  await expect(summary).toBeVisible();

  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(advanced).toHaveAttribute("open", "");

  const firstLink = advanced.getByRole("link").first();
  await expect(firstLink).toBeVisible();
  const size = await firstLink.evaluate((element) => element.getBoundingClientRect().height);
  expect(size, "Tablet destinations need at least a 44px touch target").toBeGreaterThanOrEqual(43.9);

  const overflow = await page.evaluate(() =>
    Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
  );
  expect(overflow, "The tablet rail should scroll inside itself, not overflow the page").toBeLessThanOrEqual(2);
});

test("desktop website collapse control references and restores its actual navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-1440", "Representative desktop browser behavior");

  // Scorecharts is a data-explorer archetype, where the public sidebar can collapse.
  await page.goto("/scorecharts", { waitUntil: "domcontentloaded" });

  const sidebar = page.locator(".public-section-navigation");
  const toggle = sidebar.locator(".public-section-nav-toggle");
  const body = sidebar.locator("nav.public-section-nav-body");

  await expect(sidebar).toBeVisible();
  await expect(toggle).toBeVisible();

  const controlledId = await toggle.getAttribute("aria-controls");
  expect(controlledId).toBeTruthy();
  await expect(body).toHaveAttribute("id", controlledId!);
  // Data-explorer navigation intentionally starts collapsed after hydration.
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(body).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(body).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(body).toBeHidden();
});

test("browser navigation remains identifiable in system high-contrast mode", async ({ page }, testInfo) => {
  test.skip(
    !["public-390", "public-1440"].includes(testInfo.project.name),
    "Check both mobile and desktop website navigation",
  );

  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/results", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

  if (testInfo.project.name === "public-390") {
    const nav = page.locator(".public-mobile-section-nav");
    const trigger = nav.locator(".public-mobile-section-trigger");
    await trigger.click();

    const selected = nav.locator(".public-mobile-section-link.is-active").first();
    await expect(selected).toBeVisible();
    const border = await selected.evaluate((element) =>
      getComputedStyle(element).borderInlineStartWidth,
    );
    expect(border, "Selected links keep a physical indicator in forced colors").toBe("3px");

    // Use genuine keyboard traversal so Chromium applies :focus-visible.
    await trigger.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(trigger).toBeFocused();
    const outline = await trigger.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, type: style.outlineStyle };
    });
    expect(outline).toEqual({ width: "2px", type: "solid" });
  } else {
    const nav = page.locator(".public-site-sidebar");
    const selected = nav.locator(".public-site-sidebar-link.is-active").first();
    await expect(selected).toBeVisible();
    const border = await selected.evaluate((element) =>
      getComputedStyle(element).borderInlineStartWidth,
    );
    expect(border).toBe("3px");

    await selected.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(selected).toBeFocused();
    const outlineWidth = await selected.evaluate((element) =>
      getComputedStyle(element).outlineWidth,
    );
    expect(outlineWidth).toBe("2px");
  }
});

test("reduced motion disables browser navigation disclosure and sidebar animations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "One mobile-to-desktop responsive browser probe");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/results", { waitUntil: "domcontentloaded" });

  const arrow = page.locator(".public-mobile-section-trigger svg").first();
  await expect(arrow).toBeVisible();
  const arrowTransitions = await arrow.evaluate((element) =>
    getComputedStyle(element).transitionDuration.split(",").map((value) => Number.parseFloat(value.trim())),
  );
  expect(arrowTransitions.every((duration) => duration === 0)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.locator(".public-site-sidebar");
  await expect(sidebar).toBeVisible();
  const sidebarTransitions = await sidebar.evaluate((element) =>
    getComputedStyle(element).transitionDuration.split(",").map((value) => Number.parseFloat(value.trim())),
  );
  expect(sidebarTransitions.every((duration) => duration === 0)).toBe(true);
});

test("desktop advanced section follows deep links and browser history", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-1440", "Desktop browser section route behavior");

  await page.goto("/results", { waitUntil: "domcontentloaded" });

  const sidebar = page.locator(".public-section-navigation");
  const advanced = sidebar.locator("nav.public-section-nav-body > details");
  const summary = advanced.locator("summary");
  await expect(advanced).toBeVisible();

  // Ordinary result tools start folded so they do not crowd the main rail.
  await expect(advanced).not.toHaveAttribute("open", "");

  await summary.click();
  await expect(advanced).toHaveAttribute("open", "");

  const resultLab = advanced.getByRole("link", { name: "Result Lab", exact: true });
  await expect(resultLab).toBeVisible();
  await resultLab.click();
  await expect(page).toHaveURL(/\/result-lab\/?(?:[?#].*)?$/);
  await expect(advanced).toHaveAttribute("open", "");
  await expect(resultLab).toHaveAttribute("aria-current", "page");

  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/results\/?(?:[?#].*)?$/);
  await expect(advanced).not.toHaveAttribute("open", "");

  await page.goForward({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/result-lab\/?(?:[?#].*)?$/);
  await expect(advanced).toHaveAttribute("open", "");
  await expect(resultLab).toHaveAttribute("aria-current", "page");
});
