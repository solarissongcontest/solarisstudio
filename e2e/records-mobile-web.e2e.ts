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

// Published Records filters are deep-linkable on the browser, not the installed PWA.
test("Records mobile web restores URL filters and browser category history", async ({ page }, info) => {
  test.skip(info.project.name !== "public-390");
  await page.goto("/records?category=voting&q=Reya", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-records-presentation]")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("searchbox", { name: "Search published records" })).toHaveValue("Reya");
  await expect(page.getByRole("button", { name: "Voting", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Career", exact: true }).click();
  await expect(page).toHaveURL(/[?]q=Reya$/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Voting", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page).toHaveURL(/[?]category=voting$/);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page).toHaveURL(/[?]category=all$/);
  await expect(page.getByRole("searchbox", { name: "Search published records" })).toHaveValue("");
});
