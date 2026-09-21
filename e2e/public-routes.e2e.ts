import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { auditPage, sitemapRoutes, STATIC_PUBLIC_ROUTES } from "./audit-helpers";

const fullAudit = process.env.E2E_FULL_AUDIT === "1";

async function auditRoutes(page: Page, routes: string[], testInfo: TestInfo) {
  const failures: string[] = [];

  for (const route of routes) {
    try {
      await test.step(route, () => auditPage(page, route, testInfo));
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  expect(failures, "Every public route should pass the viewport audit").toEqual([]);
}

test("public route families pass at this viewport", async ({ page }, testInfo) => {
  await auditRoutes(page, [...STATIC_PUBLIC_ROUTES].sort(), testInfo);
});

test("real Country and Wiki pages pass collision and flag audits at this viewport", async ({ page, baseURL }, testInfo) => {
  const discovered = await sitemapRoutes(baseURL!);
  const country = discovered.find((route) => /^\/countries\/[^/]+$/.test(route));
  const wiki = discovered.find((route) => /^\/wiki\/[^/]+$/.test(route));
  const routes = [country, wiki].filter((route): route is string => Boolean(route));
  expect(routes.length, "Sitemap should expose representative Country and Wiki routes").toBeGreaterThanOrEqual(2);
  await auditRoutes(page, routes, testInfo);
});

test("representative non-country dynamic route passes desktop audit", async ({ page, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "public-1440", "Additional dynamic route smoke runs once at desktop baseline");

  const discovered = await sitemapRoutes(baseURL!);
  const representativeDynamic = [
    discovered.find((route) => /^\/editions\/[^/]+$/.test(route)),
  ].filter((route): route is string => Boolean(route));

  await auditRoutes(page, representativeDynamic, testInfo);
});

test("Country Glass fixture and Edition mobile toolbar keep their visible bounds", async ({ page }, testInfo) => {
  test.skip(!["public-320", "public-390", "public-768", "public-1440"].includes(testInfo.project.name));

  const viewport = Number(testInfo.project.name.replace("public-", ""));
  await page.goto("/dev/design-v2-lab", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Viewport").selectOption(String(viewport));

  const preview = page.locator("[data-design-v2-lab-preview]");
  await expect(preview).toHaveAttribute("data-country-surface", "glass");

  const atmosphere = preview.locator(".country-v2-liquid-glass-scene-flag");
  await expect(atmosphere).toBeVisible();
  const coverage = await atmosphere.evaluate((image) => {
    const hero = image.closest(".country-v2-hero")!.getBoundingClientRect();
    const flag = image.getBoundingClientRect();
    return {
      left: flag.left - hero.left,
      right: flag.right - hero.right,
      top: flag.top - hero.top,
      bottom: flag.bottom - hero.bottom,
      fit: getComputedStyle(image).objectFit,
    };
  });
  expect(coverage.left).toBeLessThan(-20);
  expect(coverage.right).toBeGreaterThan(20);
  expect(coverage.top).toBeLessThan(-20);
  expect(coverage.bottom).toBeGreaterThan(20);
  expect(coverage.fit).toBe("cover");
  await testInfo.attach("country-v2-glass-fixture.png", {
    body: await preview.locator(".country-v2-hero").screenshot(),
    contentType: "image/png",
  });

  // The public Wiki route remains a live-data smoke. Its selected design is
  // editable content, so the audit must not assume a particular country stays
  // published as V2 Glass forever. Country and Wiki share CountryDesignV2Hero;
  // the deterministic lab above owns the Glass geometry invariant.
  await page.goto("/wiki/ABE", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "breadcrumb" })).toHaveCount(1);

  await page.goto("/editions/ssc-20", { waitUntil: "domcontentloaded" });
  const edition = page.locator(".edition-public-page");
  await expect(edition.locator("h1")).toHaveText("SSC 20");
  await expect(edition.locator(".edition-hero-subtitle")).toHaveCount(0);
  await expect(edition.locator(".public-current-status")).toHaveCount(0);
  if (["public-320", "public-390"].includes(testInfo.project.name)) {
    const nav = edition.locator(".edition-navigation-mobile");
    await expect(nav).toBeVisible();
    const dimensions = await nav.evaluate((element) => {
      const parent = element.getBoundingClientRect();
      const controls = [...element.children].map((child) => child.getBoundingClientRect());
      return { clipped: controls.some((rect) => rect.left < parent.left - 1 || rect.right > parent.right + 1), overflow: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(dimensions.clipped).toBe(false);
    expect(dimensions.overflow).toBeLessThanOrEqual(1);
  }
  await testInfo.attach("ssc20-hero.png", { body: await page.locator(".edition-hero").screenshot(), contentType: "image/png" });
});

for (let shard = 0; shard < 4; shard += 1) {
  test(`all indexable routes pass desktop audit — shard ${shard + 1}`, async ({ page, baseURL }, testInfo) => {
    test.skip(!fullAudit, "Full sitemap inventory is reserved for manual/full audit runs");
    test.skip(testInfo.project.name !== "public-1440", "Full inventory runs at desktop baseline");
    const discovered = (await sitemapRoutes(baseURL!)).sort();
    await auditRoutes(
      page,
      discovered.filter((_, index) => index % 4 === shard),
      testInfo,
    );
  });
}
