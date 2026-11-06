import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const supplement = source("src/lib/v3-public-capability-supplements.ts");
const workspaceNavigation = source("src/lib/my-solaris-navigation.ts");

const legacyRoutes = [
  "index.tsx",
  "hod.tsx",
  "readiness.tsx",
  "notices.tsx",
  "page-builder.tsx",
  "theme.tsx",
] as const;

const stablePersonalAliases = [
  ["index.tsx", "mySolarisCountry"],
  ["notices.tsx", "mySolarisNotices"],
  ["page-builder.tsx", "mySolarisPageBuilder"],
  ["theme.tsx", "mySolarisTheme"],
] as const;

const canonicalPersonalRoutes = [
  ["country.tsx", "MySolarisCountryModule"],
  ["tasks.tsx", "MySolarisTasksModule"],
  ["entry.tsx", "MySolarisEntryModule"],
  ["notices.tsx", "MySolarisNoticesModule"],
  ["page-builder.tsx", "MySolarisPageMediaModule"],
  ["theme.tsx", "MySolarisAppearanceModule"],
] as const;

describe("V3 Country Hub registry status", () => {
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
    expect(countryHubRow).toContain("canonical V3");
  });

  it("keeps every retained Country Hub bookmark redirect-only while parallel cutover work may retarget responsibilities", () => {
    for (const file of legacyRoutes) {
      const route = source(`src/routes/_authenticated/country-hub/${file}`);
      expect(route).toContain("search, replace: true");
      expect(route).toContain("component: () => null");
      expect(route).not.toContain("useQuery(");
      expect(route).not.toContain("useMutation(");
      expect(route).not.toContain("supabase.");
      expect(route).not.toContain('from "@/components/AppShell"');
    }
  });

  it("keeps stable personal aliases on their canonical MySolaris owners", () => {
    for (const [file, target] of stablePersonalAliases) {
      const route = source(`src/routes/_authenticated/country-hub/${file}`);
      expect(route).toContain(`NAV_TARGETS.${target}`);
    }
  });

  it("keeps retained personal capability ownership in native MySolaris modules", () => {
    for (const [file, moduleName] of canonicalPersonalRoutes) {
      const route = source(`src/routes/_authenticated/my-solaris/${file}`);
      expect(route).toContain(moduleName);
      expect(route).not.toContain("country-hub/");
    }

    expect(workspaceNavigation).not.toContain('to: "/country-hub');
  });
});
