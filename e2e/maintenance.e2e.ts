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

test("Solaris Studio serves the compact maintenance routing page across the app", async ({ page }) => {
  for (const route of ROUTES) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should be deliberately unavailable`).toBe(503);
    expect(response?.headers()["retry-after"]).toBeUndefined();
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");

    const main = page.locator('[data-solaris-maintenance="true"]');
    await expect(main).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Solaris Studio is temporarily unavailable",
    );
    await expect(page.getByText("Most services paused", { exact: true })).toBeVisible();
    await expect(page.getByText("HOD Confirmations available", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Service status" })).toBeVisible();
    await expect(page.getByText("HOD Confirmations", { exact: true })).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await expect(page.getByText("What does maintenance affect?")).toBeVisible();
    await expect(page.getByText("What happens next")).toBeVisible();
    await expect(page.getByText("To be announced", { exact: true })).toBeVisible();
    await expect(page.getByText("Solaris Studio", { exact: true }).first()).toBeVisible();
    await expect(page.locator('.studio-mark[src="/solaris-studio-mark.png"]')).toBeVisible();

    await expect(page.getByText(/database service error/i)).toHaveCount(0);
    await expect(page.getByText(/All Solaris Studio services are temporarily unavailable/i)).toHaveCount(0);

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
  expect(response.headers()["retry-after"]).toBeUndefined();
  await expect(response.json()).resolves.toMatchObject({
    error: "solaris_studio_maintenance",
    expected_return: "coming_soon",
  });
});
