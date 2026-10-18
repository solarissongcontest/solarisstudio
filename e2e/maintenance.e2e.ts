import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/countries/ABE",
  "/editions/ssc-20",
  "/confirmations",
  "/televoting",
  "/mysolaris",
  "/admin",
] as const;

test("Solaris Studio serves the TerraOS 3 maintenance teaser across the app", async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should be deliberately unavailable`).toBe(503);
    expect(response?.headers()["retry-after"]).toBeUndefined();
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");

    const main = page.locator('[data-solaris-maintenance="true"]');
    await expect(main).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TerraOS 3");
    await expect(page.getByText("Solaris Studio, rebuilt.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Estimated arrival", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("22 October 2026", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Take a closer look." })).toBeVisible();
    await expect(page.getByText("Five places.", { exact: false }).first()).toBeVisible();
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=home"]')).toHaveCount(2);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=explore"]')).toHaveCount(1);
    await expect(page.locator('iframe[src="/terraos-teaser-preview?screen=participate"]')).toHaveCount(1);
    await expect(page.getByText("Solaris Studio", { exact: true }).first()).toBeVisible();
    await expect(page.locator('.mark[src="/solaris-studio-mark.png"]')).toBeVisible();

    await expect(page.locator('[data-locked-copy]')).toHaveCount(0);
    await expect(page.locator('.orbit')).toHaveCount(0);
    const nextRevealCount = await page.locator('[data-next-reveal]').count();
    expect(nextRevealCount, `${route} should expose at most one next reveal`).toBeLessThanOrEqual(1);

    await expect(page.getByText(/Solaris Studio is temporarily unavailable/i)).toHaveCount(0);
    await expect(page.getByText(/database service error/i)).toHaveCount(0);
    await expect(page.getByText(/All Solaris Studio services are temporarily unavailable/i)).toHaveCount(0);

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
});

test("TerraOS teaser preview route renders the production V3 screen components during maintenance", async ({ page }) => {
  const home = await page.goto("/terraos-teaser-preview?screen=home", {
    waitUntil: "domcontentloaded",
  });
  expect(home?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="home"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solaris now", exact: true })).toBeVisible();
  await expect(page.getByText("You’re all caught up", { exact: true })).toBeVisible();
  await expect(page.getByText("SSC 22 is the current Solaris edition", { exact: true })).toBeVisible();
  let tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Home");

  const explore = await page.goto("/terraos-teaser-preview?screen=explore", {
    waitUntil: "domcontentloaded",
  });
  expect(explore?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="explore"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Discover the contest", exact: true })).toBeVisible();
  await expect(page.getByText("Search Solaris", { exact: true })).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Explore");

  const participate = await page.goto("/terraos-teaser-preview?screen=participate", {
    waitUntil: "domcontentloaded",
  });
  expect(participate?.status()).toBe(200);
  await expect(page.locator('[data-terraos-teaser-preview="participate"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your participation", exact: true })).toBeVisible();
  await expect(page.getByText("Country confirmed", { exact: true })).toBeVisible();
  tabbar = page.locator(".v3-bottom-nav");
  await expect(tabbar).toBeVisible();
  await expect(tabbar.locator('[aria-current="page"]')).toContainText("Participate");
});

test("TerraOS hero stays visually centered on a narrow phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const geometry = await page.locator("#maintenance-title").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const countdown = document.querySelector("#terraos-countdown")?.getBoundingClientRect();
    return {
      textLeft: text.left,
      textRight: text.right,
      textCenter: text.left + text.width / 2,
      countdownLeft: countdown?.left ?? -1,
      countdownRight: countdown?.right ?? -1,
      viewport: window.innerWidth,
    };
  });

  expect(geometry.textLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.textRight).toBeLessThanOrEqual(geometry.viewport);
  expect(Math.abs(geometry.textCenter - geometry.viewport / 2)).toBeLessThanOrEqual(2);
  expect(geometry.countdownLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.countdownRight).toBeLessThanOrEqual(geometry.viewport);
});

test("maintenance mode blocks writes instead of forwarding them to app services", async ({ request }) => {
  const response = await request.post("/", {
    data: { probe: "maintenance-write-block" },
  });

  expect(response.status()).toBe(503);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(response.headers()["retry-after"]).toBeUndefined();
  await expect(response.json()).resolves.toMatchObject({
    error: "solaris_studio_maintenance",
    expected_return: "coming_soon",
  });
});
