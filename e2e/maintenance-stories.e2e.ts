import { expect, test, type Locator, type Page } from "@playwright/test";

const STORIES = [
  { id: "home", title: "Home", next: "explore" },
  { id: "explore", title: "Explore", next: "participate" },
  { id: "participate", title: "Participate", next: "results" },
  { id: "results", title: "Results", next: "me" },
  { id: "me", title: "Me", next: null },
] as const;

const HOSTED_SUPABASE = /https:\/\/[^/]+\.supabase\.co\b/i;

function collectHostedSupabaseRequests(page: Page) {
  const hosted: string[] = [];
  page.on("request", (request) => {
    if (HOSTED_SUPABASE.test(request.url())) hosted.push(request.url());
  });
  return hosted;
}

async function exerciseStoryDemo(layer: Locator, id: (typeof STORIES)[number]["id"]) {
  if (id === "home") {
    await layer.locator("[data-home-toggle]").click();
    await expect(layer.locator("[data-home-demo-title]")).toHaveText("1 thing needs attention");
    return;
  }
  if (id === "explore") {
    await expect(layer.locator("[data-explore-query]")).toHaveValue("Oland");
    await expect(layer.locator("[data-explore-results]")).toBeVisible();
    return;
  }
  if (id === "participate") {
    await expect(layer.locator("[data-participate-ready]")).toHaveCount(2);
    await layer.locator("[data-participate-next]").click();
    await expect(layer.locator("[data-participate-status]")).toHaveText("Editing reopened");
    return;
  }
  if (id === "results") {
    await layer.locator('[data-result-tab="jury"]').click();
    await expect(layer.locator("[data-result-fixture]")).toHaveText("results_jury");
    return;
  }
  await layer.locator("[data-me-history-toggle]").click();
  await expect(layer.locator("[data-me-history]")).toContainText("SSC 22");
  await expect(layer.locator("[data-me-history]")).toContainText("SSC 19");
}

test("all five Take a Closer Look cards complete the canonical Story journey", async ({ page }) => {
  const hostedSupabase = collectHostedSupabaseRequests(page);

  for (const story of STORIES) {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(503);

    const card = page.locator(`[data-story-card="${story.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await card.focus();
    await card.locator(".look-copy").click();

    const layer = page.locator("[data-story-layer]");
    await expect(layer).toBeVisible();
    await expect(layer).toHaveAttribute("data-story", story.id);
    await expect(page).toHaveURL(new RegExp(`#story-${story.id}$`));
    await expect(layer.locator("[data-story-header-title]")).toHaveText(story.title);
    await expect(layer.locator("[data-story-comparison]")).toHaveCount(1);
    await expect(layer.locator(`[data-story-demo="${story.id}"]`)).toHaveCount(1);

    await exerciseStoryDemo(layer, story.id);

    if (story.next) {
      await layer.locator(`[data-story-next="${story.next}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#story-${story.next}$`));
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`#story-${story.id}$`));
      await expect(layer).toHaveAttribute("data-story", story.id);
      await layer.locator("[data-story-close]").click();
    } else {
      await expect(layer.locator("[data-me-finale-ready]")).toHaveCount(1);
      await expect(layer.locator("[data-me-brand-finale]")).toContainText("Solaris, reimagined.");
      await layer.locator("[data-story-finish]").click();
    }

    await expect(layer).toBeHidden();
    await expect(page).not.toHaveURL(/#story-/);
    await expect(card).toBeFocused();
    await expect(card.locator("[data-story-card-cta]")).toHaveText("✓ Explored");
  }

  expect(hostedSupabase).toEqual([]);
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`Story desktop composition is balanced at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const hostedSupabase = collectHostedSupabaseRequests(page);
    await page.setViewportSize(viewport);
    const response = await page.goto("/#story-home", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(503);

    const layer = page.locator("[data-story-layer]");
    await expect(layer).toBeVisible();
    await expect(layer.locator("[data-story-header-title]")).toBeVisible();

    const comparison = layer.locator("[data-story-comparison]");
    await expect(comparison.locator('[data-comparison-panel="before"]')).toBeVisible();
    await expect(comparison.locator('[data-comparison-panel="after"]')).toBeVisible();
    await expect(layer.locator(".story-comparison-tabs")).toBeHidden();

    const geometry = await comparison.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const panels = Array.from(element.querySelectorAll<HTMLElement>(".story-comparison-panel"));
      const panelWidths = panels.map((panel) => panel.getBoundingClientRect().width);
      return {
        leftGap: rect.left,
        rightGap: window.innerWidth - rect.right,
        width: rect.width,
        panelWidths,
        viewport: window.innerWidth,
      };
    });
    expect(Math.abs(geometry.leftGap - geometry.rightGap)).toBeLessThanOrEqual(2);
    expect(geometry.width).toBeLessThanOrEqual(Math.min(1180, geometry.viewport - 32) + 2);
    expect(geometry.panelWidths).toHaveLength(2);
    expect(Math.abs(geometry.panelWidths[0] - geometry.panelWidths[1])).toBeLessThanOrEqual(2);

    const preview = layer.locator(".story-real-preview-frame");
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    const previewRect = await preview.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    });
    expect(previewRect.left).toBeGreaterThanOrEqual(-1);
    expect(previewRect.right).toBeLessThanOrEqual(viewport.width + 1);

    const overflow = await layer.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(hostedSupabase).toEqual([]);
  });
}
