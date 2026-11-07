import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { PublicBreadcrumbs } from "@/components/public/PublicBreadcrumbs";

async function renderPublicBreadcrumb(pathname: "/results" | "/scorecharts" | "/rules") {
  const root = createRootRoute({ component: Outlet });
  const route = createRoute({
    getParentRoute: () => root,
    path: pathname,
    component: () => <PublicBreadcrumbs pathname={pathname} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  await router.load();

  // Deliberately no QueryClientProvider: ordinary browser breadcrumb routes
  // must never mount the archive-wide country/edition/show queries.
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("public breadcrumb query isolation", () => {
  it("renders ordinary Results subroutes without loading archive query hooks", async () => {
    const html = await renderPublicBreadcrumb("/scorecharts");
    expect(html).toContain('aria-label="breadcrumb"');
    expect(html).toContain('href="/results"');
    expect(html).toContain("Scorecharts");
    expect(html).toContain('aria-current="page"');
  });

  it("does not fetch archive metadata for plain area-root or rule-directory navigation", async () => {
    const root = await renderPublicBreadcrumb("/results");
    expect(root).not.toContain('aria-label="breadcrumb"');

    const rules = await renderPublicBreadcrumb("/rules");
    expect(rules).not.toContain("Countries");
  });

  it("mounts archive data hooks only inside matching detail-route components", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "src/components/public/PublicBreadcrumbs.tsx"), "utf8");

    const rootComponent = source.split("export function PublicBreadcrumbs")[1]?.split("function useHydrated")[0] ?? "";
    const country = source.split("function CountryBreadcrumbs")[1]?.split("function EditionBreadcrumbs")[0] ?? "";
    const edition = source.split("function EditionBreadcrumbs")[1]?.split("function ShowBreadcrumbs")[0] ?? "";
    const show = source.split("function ShowBreadcrumbs")[1]?.split("function BreadcrumbTrail")[0] ?? "";

    expect(rootComponent).not.toContain("useCountries()");
    expect(rootComponent).not.toContain("useEditions()");
    expect(rootComponent).not.toContain("useAllShows()");
    expect(country).toContain("useCountries()");
    expect(country).not.toContain("useAllShows()");
    expect(edition).toContain("useEditions()");
    expect(edition).not.toContain("useAllShows()");
    expect(show).toContain("useEditions()");
    expect(show).toContain("useAllShows()");
    expect(rootComponent).toContain("return <BreadcrumbTrail crumbs={publicBreadcrumbsForPath(pathname)} />");
  });
});
