import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 route loading skeleton contract", () => {
  it("derives loading geometry from the canonical screen registry", () => {
    const router = source("src/router.tsx");

    expect(router).toContain("const screen = pathname ? resolveSolarisAppScreen(pathname) : null");
    expect(router).toContain('screen?.hierarchy.rootTab === "participate"');
    expect(router).toContain('screen?.hierarchy.rootTab === "results"');
    expect(router).toContain('screen?.presentation === "entity"');
    expect(router).toContain("<AppRouteSkeleton variant={skeletonVariant} />");
  });

  it("reuses the existing skeleton nodes while giving core screen families distinct geometry", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");

    expect(frame).toContain('export type AppRouteSkeletonVariant = "generic" | "participant" | "entity" | "results"');
    expect(frame).toContain('variant === "participant"');
    expect(frame).toContain('["4.5rem", "8rem"]');
    expect(frame).toContain('variant === "entity"');
    expect(frame).toContain('["7rem", "5rem"]');
    expect(frame).toContain('variant === "results"');
    expect(frame).toContain('["3.5rem", "12rem"]');
    expect(frame).toContain("data-v3-route-skeleton={variant}");
  });

  it("retains the established neutral fallback", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");

    expect(frame).toContain('variant = "generic"');
    expect(frame).toContain(": [undefined, undefined]");
    expect(frame).toContain('className="solaris-app-route-skeleton-card is-compact"');
  });

  it("does not ship a second specialized skeleton module or route taxonomy", () => {
    const frame = source("src/components/app/AppRouteStateFrame.tsx");
    const router = source("src/router.tsx");

    expect(frame).not.toContain("ShapedSkeletonCard");
    expect(frame).not.toContain("AppRouteSkeletonShapes");
    expect(router).not.toContain("resolveV3RouteSkeletonVariant");
  });
});
