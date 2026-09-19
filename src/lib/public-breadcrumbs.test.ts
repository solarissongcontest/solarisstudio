import { describe, expect, it } from "vitest";

import { publicBreadcrumbsForPath } from "./public-breadcrumbs";

describe("public breadcrumbs", () => {
  it("keeps area hubs breadcrumb-free", () => {
    expect(publicBreadcrumbsForPath("/explore")).toEqual([]);
    expect(publicBreadcrumbsForPath("/participate")).toEqual([]);
    expect(publicBreadcrumbsForPath("/results")).toEqual([]);
    expect(publicBreadcrumbsForPath("/guide")).toEqual([]);
  });

  it("uses conceptual hierarchy with a final detail crumb", () => {
    expect(publicBreadcrumbsForPath("/countries")).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Countries" },
    ]);
    expect(publicBreadcrumbsForPath("/countries/oland")).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Countries", to: "/countries" },
      { label: "OLAND" },
    ]);
    expect(publicBreadcrumbsForPath("/scorecharts/ssc21-final")).toEqual([
      { label: "Results", to: "/results" },
      { label: "Scorecharts", to: "/scorecharts" },
    ]);
    expect(publicBreadcrumbsForPath("/rules/11.2")).toEqual([
      { label: "Rules & help", to: "/guide" },
      { label: "Rules", to: "/rules" },
      { label: "Rule 11.2" },
    ]);
    expect(publicBreadcrumbsForPath("/integrity/appeals/case-1")).toEqual([
      { label: "Rules & help", to: "/guide" },
      { label: "Appeals", to: "/integrity/appeals" },
    ]);
  });

  it("resolves human labels and edition context for dynamic detail routes", () => {
    const context = {
      countries: [{ id: "country-1", name: "Oland", short_code: "OL" }],
      editions: [
        {
          id: "edition-22",
          edition_number: 22,
          name: "Solaris Song Contest 22",
          slug: "ssc22",
        },
      ],
      shows: [{ id: "show-final", edition_id: "edition-22", name: "Grand Final" }],
    };

    expect(publicBreadcrumbsForPath("/countries/ol", context)).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Countries", to: "/countries" },
      { label: "Oland" },
    ]);
    expect(publicBreadcrumbsForPath("/editions/ssc22", context)).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Editions", to: "/editions" },
      { label: "SSC 22" },
    ]);
    expect(publicBreadcrumbsForPath("/shows/show-final", context)).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Shows", to: "/shows" },
      { label: "SSC 22", to: "/editions/ssc22" },
      { label: "Grand Final" },
    ]);
  });
});
