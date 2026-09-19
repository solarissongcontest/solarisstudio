import { describe, expect, it } from "vitest";

import { publicBreadcrumbsForPath } from "./public-breadcrumbs";

describe("public breadcrumbs", () => {
  it("keeps area hubs breadcrumb-free", () => {
    expect(publicBreadcrumbsForPath("/explore")).toEqual([]);
    expect(publicBreadcrumbsForPath("/participate")).toEqual([]);
    expect(publicBreadcrumbsForPath("/results")).toEqual([]);
    expect(publicBreadcrumbsForPath("/guide")).toEqual([]);
  });

  it("uses conceptual hierarchy instead of raw URL nesting", () => {
    expect(publicBreadcrumbsForPath("/countries")).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Countries" },
    ]);
    expect(publicBreadcrumbsForPath("/countries/oland")).toEqual([
      { label: "Explore", to: "/explore" },
      { label: "Countries", to: "/countries" },
    ]);
    expect(publicBreadcrumbsForPath("/scorecharts/ssc21-final")).toEqual([
      { label: "Results", to: "/results" },
      { label: "Scorecharts", to: "/scorecharts" },
    ]);
    expect(publicBreadcrumbsForPath("/rules/11.2")).toEqual([
      { label: "Rules & help", to: "/guide" },
      { label: "Rules", to: "/rules" },
    ]);
    expect(publicBreadcrumbsForPath("/integrity/appeals/case-1")).toEqual([
      { label: "Rules & help", to: "/guide" },
      { label: "Appeals", to: "/integrity/appeals" },
    ]);
  });
});
