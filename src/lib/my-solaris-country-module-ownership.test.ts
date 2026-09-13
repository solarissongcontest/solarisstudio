import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const countryRoute = source("src/routes/_authenticated/my-solaris/country.tsx");
const pageRoute = source("src/routes/_authenticated/my-solaris/page-builder.tsx");
const appearanceRoute = source("src/routes/_authenticated/my-solaris/theme.tsx");
const historyRoute = source("src/routes/_authenticated/my-solaris/history.tsx");
const countryModule = source("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
const pageModule = source("src/components/mysolaris/modules/MySolarisPageMediaModule.tsx");
const appearanceModule = source("src/components/mysolaris/modules/MySolarisAppearanceModule.tsx");
const legacyCountry = source("src/routes/_authenticated/country-hub/index.tsx");
const legacyPage = source("src/routes/_authenticated/country-hub/page-builder.tsx");
const legacyAppearance = source("src/routes/_authenticated/country-hub/theme.tsx");

describe("native MySolaris country ownership", () => {
  it("keeps canonical routes as small orchestration layers", () => {
    expect(countryRoute).toContain("MySolarisCountryModule");
    expect(pageRoute).toContain("MySolarisPageMediaModule");
    expect(appearanceRoute).toContain("MySolarisAppearanceModule");
    expect(historyRoute).toContain('<MySolarisCountryModule section="history" />');
    expect(countryRoute).not.toContain("country-hub/index");
    expect(pageRoute).not.toContain("country-hub/page-builder");
    expect(appearanceRoute).not.toContain("country-hub/theme");
  });

  it("keeps implementations route-agnostic and native to MySolaris", () => {
    for (const module of [countryModule, pageModule, appearanceModule]) {
      expect(module).not.toContain("createFileRoute");
      expect(module).not.toContain("throw redirect");
    }
    expect(pageModule).toContain('eyebrow="My country · Page & media"');
    expect(pageModule).toContain('title={`${country.name} page & media`}');
    expect(appearanceModule).toContain("NAV_TARGETS.mySolarisPageBuilder");
  });

  it("leaves every legacy Country Hub URL as a search-preserving redirect", () => {
    expect(legacyCountry).toContain("NAV_TARGETS.mySolarisCountry, search, replace: true");
    expect(legacyPage).toContain("NAV_TARGETS.mySolarisPageBuilder, search, replace: true");
    expect(legacyAppearance).toContain("NAV_TARGETS.mySolarisTheme, search, replace: true");
    for (const route of [legacyCountry, legacyPage, legacyAppearance]) {
      expect(route).toContain("component: () => null");
      expect(route).not.toContain("useMyCountryAccount");
    }
  });
});
