import { test } from "@playwright/test";

import { auditPage, sitemapRoutes, STATIC_PUBLIC_ROUTES } from "./audit-helpers";

test("all public and indexable routes pass the viewport audit", async ({
  page,
  baseURL,
}, testInfo) => {
  const discovered = await sitemapRoutes(baseURL!);
  const routes = [...new Set([...STATIC_PUBLIC_ROUTES, ...discovered])].sort();

  for (const route of routes) {
    await test.step(route, () => auditPage(page, route, testInfo));
  }
});
