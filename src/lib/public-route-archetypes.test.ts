import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  publicCanvasForArchetype,
  publicLayoutTokenForArchetype,
  publicRouteArchetype,
} from "./public-route-archetypes";

describe("public route archetypes", () => {
  it("classifies public route families by interaction pattern", () => {
    expect(publicRouteArchetype("/")).toBe("home");
    expect(publicRouteArchetype("/explore")).toBe("hub");
    expect(publicRouteArchetype("/participate")).toBe("hub");
    expect(publicRouteArchetype("/results")).toBe("hub");
    expect(publicRouteArchetype("/countries")).toBe("directory");
    expect(publicRouteArchetype("/countries/OLA")).toBe("detail");
    expect(publicRouteArchetype("/editions/ssc-22")).toBe("detail");
    expect(publicRouteArchetype("/analysis")).toBe("data-explorer");
    expect(publicRouteArchetype("/scorecharts")).toBe("data-explorer");
    expect(publicRouteArchetype("/compare")).toBe("workspace");
    expect(publicRouteArchetype("/rules/6-2")).toBe("reading");
  });

  it("classifies every canonical critical participant route as a focused task", () => {
    for (const pathname of [
      "/confirmations",
      "/jury-voting",
      "/televoting",
      "/next-in-line",
      "/my-solaris/entry",
      "/integrity/report/category",
    ]) {
      expect(publicRouteArchetype(pathname), pathname).toBe("focused-task");
    }
  });

  it("takes critical-task truth from the canonical screen registry", () => {
    const source = readFileSync("src/lib/public-route-archetypes.ts", "utf8");
    expect(source).toContain('resolveSolarisAppScreen(pathname).behavior.criticalTask');
    expect(source).not.toContain("confirmations|jury-voting|televoting|next-in-line");
    expect(source).not.toContain("integrity\\/report");
  });

  it("keeps stable CSS layout tokens separate from product archetypes", () => {
    expect(publicLayoutTokenForArchetype("data-explorer")).toBe("data");
    expect(publicLayoutTokenForArchetype("focused-task")).toBe("reading");
    expect(publicLayoutTokenForArchetype("hub")).toBe("directory");
  });

  it("uses wide canvases for public data without forcing reading pages wide", () => {
    expect(publicCanvasForArchetype("data-explorer")).toBe("max-w-[1680px]");
    expect(publicCanvasForArchetype("reading")).toBe("max-w-[1180px]");
    expect(publicCanvasForArchetype("detail")).toBe("max-w-[1920px]");
  });
});
