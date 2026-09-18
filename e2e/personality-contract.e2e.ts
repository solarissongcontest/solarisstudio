import { expect, test } from "@playwright/test";

const SOURCE_COUNT = 17;

test("Personality Gallery renders all seventeen source-driven systems", async ({ page }) => {
  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-personality-gallery]")).toBeVisible();
  await expect(page.locator("[data-gallery-personality]")).toHaveCount(SOURCE_COUNT);
  await expect(page.locator("[data-personality-qa-preview]")).toHaveCount(SOURCE_COUNT);
});

test("Personality Lab survives hostile content at 200% text, RTL and high contrast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "The hostile interaction stress run uses the canonical 390×844 mobile viewport.");

  await page.goto("/dev/personality-lab", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Country fixture").selectOption("hostile");
  await page.getByLabel("Personality").selectOption("poster");
  await page.getByLabel("Surface").selectOption("country");
  await page.getByLabel("Viewport").selectOption("390");
  await page.getByLabel("RTL").check();
  await page.getByLabel("200% text").check();
  await page.getByLabel("High contrast").check();
  await page.getByLabel("Reduced motion").check();

  const preview = page.locator("[data-personality-qa-preview]");
  await expect(preview).toBeVisible();

  const result = await preview.evaluate((root) => {
    const overflow = root.scrollWidth - root.clientWidth;
    const hero = root.querySelector<HTMLElement>(".country-identity-hero");
    if (!hero) return { overflow, collisions: ["missing hero"], titleClipped: true };

    const regions = [
      ["copy", hero.querySelector<HTMLElement>(".country-hero-copy")],
      ["flag", hero.querySelector<HTMLElement>(".country-hero-flag-zone")],
      ["actions", hero.querySelector<HTMLElement>(".country-hero-actions")],
      ["art", hero.querySelector<HTMLElement>(".country-hero-art")],
    ] as const;

    const visible = regions.filter(([, node]) => {
      if (!node || node.getClientRects().length === 0) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    const collisions: string[] = [];
    for (let left = 0; left < visible.length; left += 1) {
      for (let right = left + 1; right < visible.length; right += 1) {
        const [leftName, leftNode] = visible[left];
        const [rightName, rightNode] = visible[right];
        if (!leftNode || !rightNode) continue;
        const first = leftNode.getBoundingClientRect();
        const second = rightNode.getBoundingClientRect();
        const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        if (width > 0 && height > 0) collisions.push(`${leftName} overlaps ${rightName}`);
      }
    }

    const title = hero.querySelector<HTMLElement>(".country-hero-title");
    const titleRect = title?.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const titleClipped = !titleRect ||
      titleRect.left < heroRect.left - 1 ||
      titleRect.right > heroRect.right + 1 ||
      titleRect.top < heroRect.top - 1 ||
      titleRect.bottom > heroRect.bottom + 1;

    return { overflow, collisions, titleClipped };
  });

  expect(result.overflow).toBeLessThanOrEqual(2);
  expect(result.collisions).toEqual([]);
  expect(result.titleClipped).toBe(false);
});

test("reference-lock run captures all four canonical gallery views", async ({ page }, testInfo) => {
  test.skip(!["public-390", "public-1440"].includes(testInfo.project.name), "Reference locks use canonical 390px and 1440px viewports.");

  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });

  const isMobile = testInfo.project.name === "public-390";
  const views = isMobile
    ? (["country-mobile", "wiki-mobile"] as const)
    : (["country-desktop", "wiki-desktop"] as const);

  for (const view of views) {
    const label = view === "country-mobile"
      ? "390px Country"
      : view === "wiki-mobile"
        ? "390px Wiki"
        : view === "country-desktop"
          ? "1440px Country"
          : "1440px Wiki";
    await page.getByRole("button", { name: label }).click();

    const cards = page.locator("[data-gallery-personality]");
    for (let index = 0; index < SOURCE_COUNT; index += 1) {
      const card = cards.nth(index);
      const personality = await card.getAttribute("data-gallery-personality");
      const screenshot = await card.locator("[data-personality-qa-preview]").screenshot();
      await testInfo.attach(`${personality}-${view}`, {
        body: screenshot,
        contentType: "image/png",
      });
    }
  }
});
