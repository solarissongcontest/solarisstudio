import { expect, test } from "@playwright/test";

test("deep maintenance pages route Confirmation access to the root maintenance portal", async ({
  page,
}) => {
  const response = await page.goto("/results", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(503);

  const link = page.locator('.confirmation-link');
  await expect(link).toHaveAttribute("href", "/#confirmation-access");
  await link.click();

  await expect(page).toHaveURL(/\/#confirmation-access$/);
  await expect(page.locator("#confirmation-access")).toBeInViewport();
});
