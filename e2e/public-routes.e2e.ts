import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { auditPage, sitemapRoutes, STATIC_PUBLIC_ROUTES } from "./audit-helpers";

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

test("public route families pass at this viewport", async ({ page, baseURL }, testInfo) => {
  const discovered = await sitemapRoutes(baseURL!);
  const representativeDynamic = [
    discovered.find((route) => /^\/countries\/[^/]+$/.test(route)),
    discovered.find((route) => /^\/wiki\/[^/]+$/.test(route)),
    discovered.find((route) => /^\/editions\/[^/]+$/.test(route)),
  ].filter((route): route is string => Boolean(route));

  await auditRoutes(
    page,
    [...new Set([...STATIC_PUBLIC_ROUTES, ...representativeDynamic])].sort(),
    testInfo,
  );
});

for (let shard = 0; shard < 4; shard += 1) {
  test(`all indexable routes pass desktop audit — shard ${shard + 1}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "public-1440", "Full inventory runs at desktop baseline");
    const discovered = (await sitemapRoutes(baseURL!)).sort();
    await auditRoutes(
      page,
      discovered.filter((_, index) => index % 4 === shard),
      testInfo,
    );
  });
}
