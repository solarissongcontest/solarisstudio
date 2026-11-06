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
  await expect(body).toBeVisible();

  const controlledId = await toggle.getAttribute("aria-controls");
  expect(controlledId).toBeTruthy();
  await expect(body).toHaveAttribute("id", controlledId!);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(body).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(body).toBeVisible();
});
