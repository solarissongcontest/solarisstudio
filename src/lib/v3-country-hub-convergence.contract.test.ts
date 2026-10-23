import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const supplement = source("src/lib/v3-public-capability-supplements.ts");
const workspaceNavigation = source("src/lib/my-solaris-navigation.ts");

const legacyAliases = [
  ["index.tsx", "mySolarisCountry"],
  ["hod.tsx", "mySolarisTasks"],
  ["readiness.tsx", "mySolarisEntry"],
  ["notices.tsx", "mySolarisNotices"],
  ["page-builder.tsx", "mySolarisPageBuilder"],
  ["theme.tsx", "mySolarisTheme"],
] as const;

const canonicalRoutes = [
  ["country.tsx", "MySolarisCountryModule"],
  ["tasks.tsx", "MySolarisTasksModule"],
  ["entry.tsx", "MySolarisEntryModule"],
  ["notices.tsx", "MySolarisNoticesModule"],
  ["page-builder.tsx", "MySolarisPageMediaModule"],
  ["theme.tsx", "MySolarisAppearanceModule"],
] as const;

describe("V3 Country Hub convergence", () => {
  it("records the compatibility-only migration as active implementation work", () => {
    const countryHubRow = supplement.slice(
      supplement.indexOf('id: "country-hub"'),
      supplement.indexOf('id: "me-route"'),
    );

    expect(countryHubRow).toContain('classification: "merge"');
    expect(countryHubRow).toContain('targetArea: "me"');
    expect(countryHubRow).toContain('targetRoute: "/my-solaris"');
    expect(countryHubRow).toContain('specificationStatus: "building"');
    expect(countryHubRow).toContain("compatibility-only");
    expect(countryHubRow).toContain("native MySolaris");
  });

  it("keeps every retained Country Hub bookmark as a search-preserving canonical redirect", () => {
    for (const [file, target] of legacyAliases) {
      const route = source(`src/routes/_authenticated/country-hub/${file}`);
      expect(route).toContain(`NAV_TARGETS.${target}`);
      expect(route).toContain("search, replace: true");
      expect(route).toContain("component: () => null");
      expect(route).not.toContain("useQuery(");
      expect(route).not.toContain("supabase.");
      expect(route).not.toContain('from "@/components/AppShell"');
    }
  });

  it("keeps participant capability ownership in native MySolaris modules", () => {
    for (const [file, moduleName] of canonicalRoutes) {
      const route = source(`src/routes/_authenticated/my-solaris/${file}`);
      expect(route).toContain(moduleName);
      expect(route).not.toContain("country-hub/");
    }

    expect(workspaceNavigation).not.toContain('to: "/country-hub');
  });
});
