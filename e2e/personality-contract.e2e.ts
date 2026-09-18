import { expect, test } from "@playwright/test";

const SOURCE_COUNT = 17;

test("Personality Gallery renders all seventeen source-driven systems", async ({ page }) => {
  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-personality-gallery]")).toBeVisible();
  await expect(page.locator("[data-gallery-personality]")).toHaveCount(SOURCE_COUNT);
  await expect(page.locator("[data-personality-qa-preview]")).toHaveCount(SOURCE_COUNT);
});

test("all personalities survive hostile content at 200% text, RTL and high contrast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "The hostile interaction stress run uses the canonical 390×844 mobile viewport.");

  await page.goto("/dev/personality-lab", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Country fixture", { exact: true }).selectOption("hostile");
  await page.getByLabel("Surface", { exact: true }).selectOption("country");
  await page.getByLabel("Viewport", { exact: true }).selectOption("390");
  await page.getByLabel("RTL", { exact: true }).check();
  await page.getByLabel("200% text", { exact: true }).check();
  await page.getByLabel("High contrast", { exact: true }).check();
  await page.getByLabel("Reduced motion", { exact: true }).check();

  const preview = page.locator("[data-personality-qa-preview]");
  await expect(preview).toBeVisible();
  const personalities = await page.getByLabel("Personality", { exact: true }).locator("option").evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );

  for (const personality of personalities) {
    await page.getByLabel("Personality", { exact: true }).selectOption(personality);
    await expect(preview.locator(".country-identity-hero")).toHaveAttribute("data-country-personality", personality);

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

    expect(result.overflow, `${personality} horizontal overflow`).toBeLessThanOrEqual(2);
    expect(result.collisions, `${personality} semantic collisions`).toEqual([]);
    expect(result.titleClipped, `${personality} title clipping`).toBe(false);
  }
});



test("flag loading, failure and fallback states are deterministic", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "Flag lifecycle QA uses the canonical mobile Lab.");

  await page.route("**/personality-qa-flag.svg?slow=1", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#ddd"/><rect width="1" height="2" fill="#555"/></svg>',
    });
  });
  await page.route("**/personality-qa-flag-missing.svg", (route) => route.abort("failed"));

  await page.goto("/dev/personality-lab", { waitUntil: "domcontentloaded" });
  const flag = page.locator("[data-personality-qa-preview] [data-flag-role='official']");

  await page.getByLabel("Flag state", { exact: true }).selectOption("slow-load");
  await expect(flag).toHaveAttribute("data-flag-state", "loading");
  await expect(flag).toHaveAttribute("aria-busy", "true");
  await expect(flag).toHaveAttribute("data-flag-state", "ready", { timeout: 5_000 });
  await expect(flag.getByRole("img", { name: /Flag of/i })).toBeVisible();

  await page.getByLabel("Flag state", { exact: true }).selectOption("network-failure");
  await expect(flag).toHaveAttribute("data-flag-state", "error", { timeout: 5_000 });
  await expect(flag.getByRole("status")).toHaveAccessibleName(/Flag unavailable/i);

  await page.getByLabel("Flag state", { exact: true }).selectOption("missing");
  await expect(flag).toHaveAttribute("data-flag-state", "missing");
  await expect(flag.getByRole("status")).toHaveAccessibleName(/Flag unavailable/i);
});

test("all personalities retain semantics and visible keyboard focus in forced colors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "public-390", "Forced-colors accessibility QA uses the canonical mobile viewport.");

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

  const cards = page.locator("[data-gallery-personality]");
  await expect(cards).toHaveCount(SOURCE_COUNT);
  for (let index = 0; index < SOURCE_COUNT; index += 1) {
    const card = cards.nth(index);
    const personality = await card.getAttribute("data-gallery-personality");
    await expect(card.getByRole("heading", { level: 1 })).toHaveCount(1);
    const buttons = card.getByRole("button");
    await expect(buttons).toHaveCount(3);

    const first = buttons.first();
    await first.focus();
    const focus = await first.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        active: document.activeElement === element,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: parseFloat(style.outlineWidth || "0"),
      };
    });
    expect(focus.active, `${personality} keyboard focus`).toBe(true);
    expect(focus.focusVisible, `${personality} :focus-visible`).toBe(true);
    expect(focus.outlineStyle, `${personality} focus outline style`).not.toBe("none");
    expect(focus.outlineWidth, `${personality} focus outline width`).toBeGreaterThanOrEqual(2);
  }
});

test("all personalities preserve coarse-pointer touch targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-touch-390", "Coarse-pointer QA runs in the touch project.");

  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  const cards = page.locator("[data-gallery-personality]");
  for (let index = 0; index < SOURCE_COUNT; index += 1) {
    const card = cards.nth(index);
    const personality = await card.getAttribute("data-gallery-personality");
    const buttons = card.getByRole("button");
    for (let buttonIndex = 0; buttonIndex < await buttons.count(); buttonIndex += 1) {
      const box = await buttons.nth(buttonIndex).boundingBox();
      expect(box, `${personality} button ${buttonIndex} bounding box`).not.toBeNull();
      expect(box!.height, `${personality} button ${buttonIndex} touch height`).toBeGreaterThanOrEqual(44);
    }
  }
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
