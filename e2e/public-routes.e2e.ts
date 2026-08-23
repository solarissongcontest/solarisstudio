import { expect, test } from "@playwright/test";

import { auditPage, sitemapRoutes, STATIC_PUBLIC_ROUTES } from "./audit-helpers";

test("all public and indexable routes pass the viewport audit", async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(15 * 60_000);
  const discovered = await sitemapRoutes(baseURL!);
  const routes = [...new Set([...STATIC_PUBLIC_ROUTES, ...discovered])].sort();
  const failures: string[] = [];

  for (const route of routes) {
    try {
      await test.step(route, () => auditPage(page, route, testInfo));
    } catch (error) {
      failures.push(`${route}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  expect(failures, "Every public route should pass the viewport audit").toEqual([]);
});
