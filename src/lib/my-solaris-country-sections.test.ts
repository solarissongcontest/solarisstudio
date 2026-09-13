import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const country = source("src/components/mysolaris/modules/MySolarisCountryModule.tsx");
const history = source("src/routes/_authenticated/my-solaris/history.tsx");

describe("focused MySolaris country sections", () => {
  it("limits the Country tab switcher to identity and facts", () => {
    const tabs = country.slice(
      country.indexOf("const COUNTRY_TABS"),
      country.indexOf("function entryCompleteness"),
    );
    expect(tabs).toContain('id: "overview"');
    expect(tabs).toContain('id: "country"');
    expect(tabs).not.toContain('id: "page"');
    expect(tabs).not.toContain('id: "entries"');
    expect(country).toContain('section === "country" && activeTab === "overview"');
    expect(country).toContain('section === "country" && activeTab === "country"');
  });

  it("routes page tools and participation history to their own sidebar destinations", () => {
    expect(country).toContain("NAV_TARGETS.mySolarisPageBuilder");
    expect(country).toContain("NAV_TARGETS.mySolarisTheme");
    expect(country).toContain("NAV_TARGETS.mySolarisHistory");
    expect(history).toContain('<MySolarisCountryModule section="history" />');
  });

  it("keeps existing edition editing and delegation handovers inside History", () => {
    expect(country).toContain('section === "history" && activeTab === "entries"');
    expect(country).toContain("<CountryHodHistoryPanel inline />");
    expect(country).toContain("Add a missing edition participation");
    expect(country).toContain("Edit once per edition:");
    expect(country).toContain("useSaveEntryListeningLinks");
  });
});
