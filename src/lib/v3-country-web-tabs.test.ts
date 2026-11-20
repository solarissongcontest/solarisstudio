import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  COUNTRY_WEB_SECTIONS,
  countrySectionHash,
  sectionFromCountryHash,
} from "./v3-country-web-tabs";

const route = readFileSync("src/routes/countries/$code.tsx", "utf8");
const styles = readFileSync("src/styles/v3-country-web-sections.css", "utf8");

describe("ordinary-web country section permalinks", () => {
  it("maps public fragments to the actual supported tabs", () => {
    expect(COUNTRY_WEB_SECTIONS).toEqual([
      "overview", "entries", "results", "voting", "relationships", "form",
    ]);
    for (const tab of COUNTRY_WEB_SECTIONS) {
      expect(sectionFromCountryHash(countrySectionHash(tab))).toBe(tab);
      expect(sectionFromCountryHash(`#${tab}`)).toBe(tab);
    }
    expect(countrySectionHash("overview")).toBe("");
  });

  it("treats malformed, unknown, or unrelated fragments as Overview", () => {
    expect(sectionFromCountryHash("#not-a-real-section")).toBe("overview");
    expect(sectionFromCountryHash("#")).toBe("overview");
    expect(sectionFromCountryHash(null)).toBe("overview");
    expect(sectionFromCountryHash("%3Cscript%3E")).toBe("overview");
  });

  it("shares browser URLs through router navigation and keeps installed-app tabs separate", () => {
    expect(route).toContain("state.location.hash");
    expect(route).toContain("sectionFromCountryHash(routeHash)");
    expect(route).toContain("void navigate({ hash: countrySectionHash(next) })");
    expect(route).toContain("if (isAppMode) setAppTab(next)");
    expect(route).toContain('className="country-web-section-nav"');
    expect(route).toContain("hash={countrySectionHash(item.value)}");
    expect(route).toContain('aria-current={tab === item.value ? "page" : undefined}');
    expect(route).toContain('id={tab} className="country-web-section-anchor"');
    expect(route).toContain("scrollIntoView({");
    expect(route).toContain("behavior: \"auto\"");
    expect(route).toContain("country?.id, visualLoading]");
    expect(route).toContain("if (!country || visualLoading || isAppMode");
    expect(styles).toContain("scroll-margin-top: 5rem");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain("@media (max-width: 47.99rem)");
  });
});
