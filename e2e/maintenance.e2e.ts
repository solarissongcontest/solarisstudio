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
    await expect(page.locator('[data-locked-copy="More on 19.10"]')).toHaveAttribute(
      "data-reveal-at",
      "2026-10-19T00:00:00+03:00",
    );
    await expect(page.locator('[data-locked-copy="More on 20.10"]')).toHaveAttribute(
      "data-reveal-at",
      "2026-10-20T00:00:00+03:00",
    );
    await expect(page.locator('[data-locked-copy="More on 21.10"]')).toHaveAttribute(
      "data-reveal-at",
      "2026-10-21T00:00:00+03:00",
    );
    await expect(page.getByText("Solaris Studio", { exact: true }).first()).toBeVisible();
    await expect(page.locator('.mark[src="/solaris-studio-mark.png"]')).toBeVisible();

    await expect(page.getByText(/Solaris Studio is temporarily unavailable/i)).toHaveCount(0);
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
