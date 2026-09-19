import { expect, test } from "@playwright/test";

const SOURCE_COUNT = 17;

const labControl = (page: import("@playwright/test").Page, control: string) =>
  page.locator(`[data-personality-control="${control}"]`);

async function openPersonalityLab(page: import("@playwright/test").Page) {
  await page.goto("/dev/personality-lab", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-personality-lab-ready="true"]')).toBeVisible({ timeout: 60_000 });
  const controls = page.getByRole("region", { name: "Personality Lab controls" });
  await expect(controls).toBeVisible({ timeout: 60_000 });
  await expect(labControl(page, "fixture")).toBeVisible({ timeout: 60_000 });
  await expect(labControl(page, "personality")).toBeVisible({ timeout: 60_000 });
  await expect(labControl(page, "viewport")).toBeVisible({ timeout: 60_000 });
  await expect(labControl(page, "flag")).toBeVisible({ timeout: 60_000 });
}

test("Personality Gallery renders all seventeen source-driven systems", async ({ page }) => {
  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-personality-gallery]")).toBeVisible();
  await expect(page.locator("[data-gallery-personality]")).toHaveCount(SOURCE_COUNT);
  await expect(page.locator("[data-personality-qa-preview]")).toHaveCount(SOURCE_COUNT);
});

test("all personalities survive hostile content at 200% text, RTL and high contrast", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-390", "The hostile interaction stress run uses the canonical 390×844 mobile viewport.");

  await openPersonalityLab(page);
  await labControl(page, "fixture").selectOption("hostile");
  await labControl(page, "surface").selectOption("country");
  await labControl(page, "viewport").selectOption("390");
  await labControl(page, "rtl").check();
  await labControl(page, "text-200").check();
  await labControl(page, "contrast").check();
  await labControl(page, "motion").check();

  const preview = page.locator("[data-personality-qa-preview]");
  await expect(preview).toBeVisible();
  const personalities = await labControl(page, "personality").locator("option").evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );

  for (const personality of personalities) {
    await labControl(page, "personality").selectOption(personality);
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



test("all canonical flag fixtures preserve intrinsic aspect ratio", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-390", "Flag geometry QA uses the canonical mobile Lab.");

  await openPersonalityLab(page);
  const flag = page.locator("[data-personality-qa-preview] [data-flag-role='official']");
  const cases = ["1-1", "3-2", "2-1", "2-3", "transparent", "white-dominant", "black-dominant", "detailed"] as const;

  for (const flagCase of cases) {
    await labControl(page, "flag").selectOption(flagCase);
    await expect(flag).toHaveAttribute("data-flag-state", "ready");
    const metrics = await flag.getByRole("img").evaluate((image) => {
      const img = image as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      const style = getComputedStyle(img);
      return {
        naturalRatio: img.naturalWidth / img.naturalHeight,
        renderedRatio: rect.width / rect.height,
        objectFit: style.objectFit,
        opacity: style.opacity,
      };
    });
    expect(metrics.objectFit, `${flagCase} object-fit`).toBe("contain");
    expect(metrics.opacity, `${flagCase} factual flag opacity`).toBe("1");
    expect(
      Math.abs(metrics.naturalRatio - metrics.renderedRatio),
      `${flagCase} aspect-ratio distortion`,
    ).toBeLessThan(0.03);
  }
});

test("neutral and sparse fixtures remain robust across Country and Wiki for all personalities", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-390", "Fixture matrix QA uses the canonical mobile viewport.");

  await openPersonalityLab(page);
  await labControl(page, "viewport").selectOption("390");
  const personalities = await labControl(page, "personality").locator("option").evaluateAll(
    (options) => options.map((option) => (option as HTMLOptionElement).value),
  );

  for (const fixture of ["neutral", "sparse"] as const) {
    await labControl(page, "fixture").selectOption(fixture);
    for (const surface of ["country", "wiki"] as const) {
      await labControl(page, "surface").selectOption(surface);
      for (const personality of personalities) {
        await labControl(page, "personality").selectOption(personality);
        const preview = page.locator("[data-personality-qa-preview]");
        await expect(preview.locator(".country-identity-hero")).toHaveAttribute("data-country-personality", personality);

        const result = await preview.evaluate((root) => {
          const hero = root.querySelector<HTMLElement>(".country-identity-hero");
          const title = root.querySelector<HTMLElement>(".country-hero-title");
          if (!hero || !title) return { overflow: 999, clipped: true };
          const titleRect = title.getBoundingClientRect();
          const heroRect = hero.getBoundingClientRect();
          return {
            overflow: root.scrollWidth - root.clientWidth,
            clipped:
              titleRect.left < heroRect.left - 1 ||
              titleRect.right > heroRect.right + 1 ||
              titleRect.top < heroRect.top - 1 ||
              titleRect.bottom > heroRect.bottom + 1,
          };
        });

        expect(result.overflow, `${fixture}/${surface}/${personality} overflow`).toBeLessThanOrEqual(2);
        expect(result.clipped, `${fixture}/${surface}/${personality} title clipping`).toBe(false);

        if (fixture === "sparse" && surface === "country") {
          await expect(preview.getByText("No current entry is available.")).toBeVisible();
          await expect(preview.getByText("No participation history is available.")).toBeVisible();
        }
        if (fixture === "sparse" && surface === "wiki") {
          await expect(preview.getByText("No Wiki article content is available for this country yet.")).toBeVisible();
        }
      }
    }
  }
});

test("flag loading, failure and fallback states are deterministic", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-390", "Flag lifecycle QA uses the canonical mobile Lab.");

  await page.route("**/personality-qa-flag.svg?slow=1", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2"><rect width="3" height="2" fill="#ddd"/><rect width="1" height="2" fill="#555"/></svg>',
    });
  });
  await page.route("**/personality-qa-flag-missing.svg", (route) => route.abort("failed"));

  await openPersonalityLab(page);
  const flag = page.locator("[data-personality-qa-preview] [data-flag-role='official']");

  await labControl(page, "flag").selectOption("slow-load");
  await expect(flag).toHaveAttribute("data-flag-state", "loading");
  await expect(flag).toHaveAttribute("aria-busy", "true");
  await expect(flag).toHaveAttribute("data-flag-state", "ready", { timeout: 5_000 });
  await expect(flag.getByRole("img", { name: /Flag of/i })).toBeVisible();

  await labControl(page, "flag").selectOption("network-failure");
  await expect(flag).toHaveAttribute("data-flag-state", "error", { timeout: 5_000 });
  await expect(flag.getByRole("status")).toHaveAccessibleName(/Flag unavailable/i);

  await labControl(page, "flag").selectOption("missing");
  await expect(flag).toHaveAttribute("data-flag-state", "missing");
  await expect(flag.getByRole("status")).toHaveAccessibleName(/Flag unavailable/i);
});

test("all personalities retain semantics and visible keyboard focus in forced colors", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-390", "Forced-colors accessibility QA uses the canonical mobile viewport.");

  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);

  const cards = page.locator("[data-gallery-personality]");
  await expect(cards).toHaveCount(SOURCE_COUNT);
  for (let index = 0; index < SOURCE_COUNT; index += 1) {
    let personality = `personality-${index + 1}`;
    let focus:
      | {
          active: boolean;
          focusVisible: boolean;
          outlineStyle: string;
          outlineWidth: number;
        }
      | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const card = page.locator("[data-gallery-personality]").nth(index);
      personality = (await card.getAttribute("data-gallery-personality")) ?? personality;
      await expect(card.getByRole("heading", { level: 1 })).toHaveCount(1);
      const buttons = card.getByRole("button");
      await expect(buttons).toHaveCount(3);

      const first = buttons.first();
      await expect(first).toBeVisible();
      await first.focus();
      focus = await first.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          active: document.activeElement === element,
          focusVisible: element.matches(":focus-visible"),
          outlineStyle: style.outlineStyle,
          outlineWidth: parseFloat(style.outlineWidth || "0"),
        };
      });

      if (
        focus.active &&
        focus.focusVisible &&
        focus.outlineStyle !== "none" &&
        focus.outlineWidth >= 2
      ) {
        break;
      }

      await page.waitForTimeout(100);
    }

    expect(focus?.active, `${personality} keyboard focus`).toBe(true);
    expect(focus?.focusVisible, `${personality} :focus-visible`).toBe(true);
    expect(focus?.outlineStyle, `${personality} focus outline style`).not.toBe("none");
    expect(focus?.outlineWidth ?? 0, `${personality} focus outline width`).toBeGreaterThanOrEqual(2);
  }
});

test("all personalities preserve coarse-pointer touch targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "personality-touch-390", "Coarse-pointer QA runs in the touch project.");

  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

  const cards = page.locator("[data-gallery-personality]");
  await expect(cards).toHaveCount(SOURCE_COUNT);
  for (let index = 0; index < SOURCE_COUNT; index += 1) {
    const initialCard = page.locator("[data-gallery-personality]").nth(index);
    const personality =
      (await initialCard.getAttribute("data-gallery-personality")) ?? `personality-${index + 1}`;
    const initialButtons = initialCard.getByRole("button").filter({ visible: true });
    const buttonCount = await initialButtons.count();

    for (let buttonIndex = 0; buttonIndex < buttonCount; buttonIndex += 1) {
      let height = 0;

      for (let attempt = 0; attempt < 3 && height < 44; attempt += 1) {
        const button = page
          .locator("[data-gallery-personality]")
          .nth(index)
          .getByRole("button")
          .filter({ visible: true })
          .nth(buttonIndex);

        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        height = box?.height ?? 0;

        if (height < 44) await page.waitForTimeout(100);
      }

      expect(
        height,
        `${personality} visible button ${buttonIndex} touch height`,
      ).toBeGreaterThanOrEqual(44);
    }
  }
});

test("reference-lock run captures all four canonical gallery views", async ({ page }, testInfo) => {
  test.skip(!["personality-390", "personality-1440"].includes(testInfo.project.name), "Reference locks use canonical 390px and 1440px viewports.");

  await page.goto("/dev/personality-gallery", { waitUntil: "domcontentloaded" });

  const isMobile = testInfo.project.name === "personality-390";
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
    await expect(cards).toHaveCount(SOURCE_COUNT);

    for (let index = 0; index < SOURCE_COUNT; index += 1) {
      let personality = `personality-${index + 1}`;
      let screenshot: Buffer | null = null;
      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3 && !screenshot; attempt += 1) {
        const card = page.locator("[data-gallery-personality]").nth(index);
        personality = (await card.getAttribute("data-gallery-personality")) ?? personality;
        const preview = card.locator("[data-personality-qa-preview]");
        await expect(preview).toBeVisible();

        try {
          screenshot = await preview.screenshot({ animations: "disabled" });
        } catch (error) {
          lastError = error;
          await page.waitForTimeout(100);
        }
      }

      if (!screenshot) throw lastError ?? new Error(`Could not capture ${personality} ${view}`);

      await testInfo.attach(`${personality}-${view}`, {
        body: screenshot,
        contentType: "image/png",
      });
    }
  }
});
