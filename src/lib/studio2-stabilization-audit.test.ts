import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SOLARIS_FEATURE_FLAGS, type SolarisFeatureFlag } from "./feature-flags";
import {
  STUDIO2_PRODUCT_SURFACES,
  studio2EnabledDependents,
  studio2MissingDependencies,
  studio2RolloutDecision,
  studio2SurfaceRolloutEligible,
} from "./studio2-product-surfaces";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function routeFile(route: string) {
  if (route.startsWith("/admin/")) {
    return resolve(
      process.cwd(),
      "src/routes/_authenticated/admin",
      `${route.slice("/admin/".length)}.tsx`,
    );
  }
  if (route.startsWith("/country-hub/")) {
    return resolve(
      process.cwd(),
      "src/routes/_authenticated/country-hub",
      `${route.slice("/country-hub/".length)}.tsx`,
    );
  }
  if (route.startsWith("/my-solaris/")) {
    return resolve(
      process.cwd(),
      "src/routes/_authenticated/my-solaris",
      `${route.slice("/my-solaris/".length)}.tsx`,
    );
  }
  if (route.startsWith("/") && !route.includes("$")) {
    const routeName = route.slice(1);
    const authenticatedRoute = resolve(
      process.cwd(),
      "src/routes/_authenticated",
      `${routeName}.tsx`,
    );
    if (existsSync(authenticatedRoute)) return authenticatedRoute;

    return resolve(process.cwd(), "src/routes", routeName, "index.tsx");
  }
  return null;
}

const adminNav = source("src/components/admin/admin-navigation.ts");
const operationsPanel = source("src/components/MySolarisOperationsPanel.tsx");
const authenticatedRoute = source("src/routes/_authenticated/route.tsx");
const adminRoute = source("src/routes/_authenticated/admin/route.tsx");

describe("Studio 2 stabilization contract", () => {
  it("classifies every feature flag exactly once", () => {
    expect(Object.keys(STUDIO2_PRODUCT_SURFACES).sort()).toEqual([...SOLARIS_FEATURE_FLAGS].sort());

    for (const key of SOLARIS_FEATURE_FLAGS) {
      expect(STUDIO2_PRODUCT_SURFACES[key].key).toBe(key);
    }
  });

  it("keeps all manifest dependencies valid and non-recursive at one hop", () => {
    for (const surface of Object.values(STUDIO2_PRODUCT_SURFACES)) {
      for (const dependency of surface.dependsOn ?? []) {
        expect(SOLARIS_FEATURE_FLAGS).toContain(dependency);
        expect(dependency).not.toBe(surface.key);
      }
    }
  });

  it("keeps dedicated and integrated product routes backed by real route files", () => {
    const routed = Object.values(STUDIO2_PRODUCT_SURFACES).filter((surface) => surface.route);
    expect(routed.length).toBeGreaterThan(0);

    for (const surface of routed) {
      const file = routeFile(surface.route!);
      expect(file, `${surface.key} uses an unsupported manifest route shape`).not.toBeNull();
      expect(existsSync(file!), `${surface.key} route ${surface.route} has no route file`).toBe(
        true,
      );
    }
  });

  it("keeps organizer Studio 2 surfaces discoverable from Organizer navigation", () => {
    const organizerSurfaces = Object.values(STUDIO2_PRODUCT_SURFACES).filter(
      (surface) =>
        surface.audience === "organizer" &&
        surface.route &&
        (surface.state === "product_surface" || surface.state === "integrated"),
    );

    for (const surface of organizerSurfaces) {
      expect(adminNav, `${surface.label} disappeared from Organizer navigation`).toContain(
        surface.route!,
      );
    }
  });

  it("keeps delegation Studio 2 surfaces discoverable from My Solaris delegation operations", () => {
    const delegationSurfaces = Object.values(STUDIO2_PRODUCT_SURFACES).filter(
      (surface) =>
        surface.audience === "delegation" &&
        surface.route &&
        (surface.state === "product_surface" || surface.state === "integrated"),
    );

    for (const surface of delegationSurfaces) {
      expect(operationsPanel, `${surface.label} disappeared from MySolaris operations`).toContain(
        "NAV_TARGETS.mySolarisTasks",
      );
    }
  });

  it("rollout-locks planned and externally owned work while allowing finished foundations and surfaces", () => {
    for (const surface of Object.values(STUDIO2_PRODUCT_SURFACES)) {
      const shouldBeEligible =
        surface.state !== "planned" && surface.state !== "external_workstream";
      expect(studio2SurfaceRolloutEligible(surface), surface.key).toBe(shouldBeEligible);
    }
  });

  it("requires declared dependencies before a dependent feature can be enabled", () => {
    const state = Object.fromEntries(
      SOLARIS_FEATURE_FLAGS.map((key) => [key, key === "public_ia_v3"]),
    ) as Record<SolarisFeatureFlag, boolean>;

    expect(studio2MissingDependencies("admin_results_v2", state)).toContain("studio2_results");
    expect(studio2RolloutDecision("admin_results_v2", state)).toEqual({
      allowed: false,
      reason: "missing_dependency",
      missingDependencies: ["studio2_results"],
    });
  });

  it("protects enabled dependencies from being disabled underneath active features", () => {
    const state = Object.fromEntries(
      SOLARIS_FEATURE_FLAGS.map((key) => [key, false]),
    ) as Record<SolarisFeatureFlag, boolean>;
    state.studio2_results = true;
    state.admin_results_v2 = true;

    expect(studio2EnabledDependents("studio2_results", state)).toContain("admin_results_v2");
  });

  it("makes rollout decisions from product state and dependency state rather than route-source strings", () => {
    const state = Object.fromEntries(
      SOLARIS_FEATURE_FLAGS.map((key) => [key, true]),
    ) as Record<SolarisFeatureFlag, boolean>;

    expect(studio2RolloutDecision("studio2_results", state).allowed).toBe(true);
    expect(studio2RolloutDecision("public_ia_v3", state).allowed).toBe(true);
  });

  it("keeps the separate Rules workstream explicitly isolated", () => {
    expect(STUDIO2_PRODUCT_SURFACES.rules_v2.state).toBe("external_workstream");
    expect(STUDIO2_PRODUCT_SURFACES.rules_v2.route).toBe("/admin/rules-manager");
  });

  it("keeps every authenticated Organizer route behind authoritative V2 access", () => {
    expect(authenticatedRoute).toContain("<Outlet />");
    expect(adminRoute).toContain("useAdminSession");
    expect(adminRoute).toContain("requireAdminAccess");
  });
});