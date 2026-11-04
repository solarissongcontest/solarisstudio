import { expect, test } from "@playwright/test";

test("Records mobile browser and desktop have different layouts", async ({ page }, info) => {
  test.skip(!["public-390", "public-1440"].includes(info.project.name));
  await page.goto("/records", { waitUntil: "domcontentloaded" });
  const root = page.locator("[data-records-presentation]");
  await expect(root).toBeVisible({ timeout: 45_000 });
  const phone = info.project.name === "public-390";
  await expect(root).toHaveAttribute("data-records-presentation", phone ? "mobile-web" : "desktop-web");
  await expect(root.locator("[data-records-mobile-web-header]")).toHaveCount(phone ? 1 : 0);
  await expect(root.locator("[data-records-mobile-web-categories]")).toHaveCount(phone ? 1 : 0);
});
