import { expect, test, type Page } from "@playwright/test";

const SUPABASE_API_PATH = /\/(?:auth|rest|functions|storage|realtime|graphql)\/v1\//;
const HOSTED_SUPABASE = /https:\/\/[^/]+\.supabase\.co\b/i;

function collectPreviewDataRequests(page: Page) {
  const supabase: string[] = [];
  const hosted: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (HOSTED_SUPABASE.test(url)) hosted.push(url);
    if (SUPABASE_API_PATH.test(new URL(url).pathname)) supabase.push(url);
  });
  return { supabase, hosted };
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("direct TerraOS preview is read-only, safe-area aware and usable across maintenance viewports", async ({
  page,
}) => {
  const requests = collectPreviewDataRequests(page);
  const response = await page.goto("/terraos-teaser-preview?screen=home", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);

  await expect(page.locator('[data-terraos-live-preview-shell="true"]')).toBeVisible();
  await expect(page.locator('[data-terraos-teaser-preview="home"]')).toBeVisible();
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "TerraOS 3 preview navigation" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(5);
  await expect(nav.locator('[aria-current="page"]')).toHaveAttribute("aria-label", "Home");

  const initialGeometry = await page.evaluate(() => {
    const nav = document.querySelector(".terraos-live-preview-nav")?.getBoundingClientRect();
    const topContext = document.querySelector(".v3-top-context__edition")?.getBoundingClientRect();
    if (!nav || !topContext) return null;
    return {
      navLeft: nav.left,
      navRight: nav.right,
      navBottom: nav.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      topContextTop: topContext.top,
    };
  });
  expect(initialGeometry).not.toBeNull();
  expect(initialGeometry!.navLeft).toBeGreaterThanOrEqual(-1);
  expect(initialGeometry!.navRight).toBeLessThanOrEqual(initialGeometry!.viewportWidth + 1);
  expect(initialGeometry!.navBottom).toBeLessThanOrEqual(initialGeometry!.viewportHeight + 1);
  expect(initialGeometry!.topContextTop).toBeGreaterThanOrEqual(-1);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const bottomGeometry = await page.evaluate(() => {
    const nav = document.querySelector(".terraos-live-preview-nav")?.getBoundingClientRect();
    const screen = document.querySelector(".v3-screen");
    const last = screen?.lastElementChild?.getBoundingClientRect();
    if (!nav || !last) return null;
    return { navTop: nav.top, lastContentBottom: last.bottom };
  });
  expect(bottomGeometry).not.toBeNull();
  expect(bottomGeometry!.lastContentBottom).toBeLessThanOrEqual(bottomGeometry!.navTop + 1);
  await expectNoHorizontalOverflow(page);

  await nav.getByRole("link", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/terraos-teaser-preview\?screen=explore$/);
  await expect(page.locator('[data-terraos-teaser-preview="explore"]')).toBeVisible();
  await expect(page.getByRole("navigation", { name: "TerraOS 3 preview navigation" }).locator('[aria-current="page"]')).toHaveAttribute(
    "aria-label",
    "Explore",
  );

  await page.getByRole("navigation", { name: "TerraOS 3 preview navigation" }).getByRole("link", { name: "Results" }).click();
  await expect(page).toHaveURL(/\/terraos-teaser-preview\?screen=results$/);
  await expect(page.locator('[data-terraos-teaser-preview="results"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Official results", exact: true })).toBeVisible();

  expect(requests.supabase, "fixture preview must not call any Supabase API").toEqual([]);
  expect(requests.hosted, "browser verification must never reach hosted Supabase").toEqual([]);
});
