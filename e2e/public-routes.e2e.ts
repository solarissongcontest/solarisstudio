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
