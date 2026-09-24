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

test("Solaris Studio serves the emergency maintenance notice across the app", async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should be deliberately unavailable`).toBe(503);

    const main = page.locator('[data-solaris-maintenance="true"]');
    await expect(main).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Solaris Studio is temporarily offline",
    );
    await expect(page.getByText("10 October 2026", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/All deadlines scheduled during this outage will be postponed/i),
    ).toBeVisible();
    await expect(page.getByAltText("TSBC")).toBeVisible();
    await expect(page.getByAltText("Solaris Studio")).toBeVisible();

    const overflow = await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow, `${route} should not overflow horizontally`).toBeLessThanOrEqual(1);
  }
});

test("maintenance mode blocks writes instead of forwarding them to app services", async ({ request }) => {
  const response = await request.post("/", {
    data: { probe: "maintenance-write-block" },
  });

  expect(response.status()).toBe(503);
  expect(response.headers()["content-type"]).toContain("application/json");
  await expect(response.json()).resolves.toMatchObject({
    error: "solaris_studio_maintenance",
    expected_return: "2026-10-10",
  });
});
