import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  COUNTRY_WEB_SECTIONS,
  countrySectionHash,
  countryTabNeedsDetailedVotes,
  sectionFromCountryHash,
} from "./v3-country-web-tabs";

const route = readFileSync("src/routes/countries/$code.tsx", "utf8");
const styles = readFileSync("src/styles/v3-country-web-sections.css", "utf8");
const hero = readFileSync("src/components/country/CountryWebCinematicHero.tsx", "utf8");

describe("ordinary-web country section permalinks", () => {
  it("avoids full ballot archive downloads on public Country overview, history, entries and results", () => {
    for (const tab of ["overview", "entries", "results"] as const) {
      expect(countryTabNeedsDetailedVotes(tab)).toBe(false);
    }
    for (const tab of ["voting", "relationships", "form"] as const) {
      expect(countryTabNeedsDetailedVotes(tab)).toBe(true);
    }
    expect(route).toContain("const needsDetailedVotes = countryTabNeedsDetailedVotes(tab)");
    expect(route).toContain("useAllJuryVotes({ enabled: archiveEnabled && needsDetailedVotes })");
    expect(route).toContain("useAllTelevotes({ enabled: archiveEnabled && needsDetailedVotes })");
    expect(route).toContain("...(needsDetailedVotes ? [juryQuery, televoteQuery] : [])");
    expect(route).toContain('tab === "relationships" && !archiveLoading');
  });

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

  it("returns from a selected section to the real Overview hero and supports #overview deep links", () => {
    expect(hero).toContain('id="country-overview"');
    expect(route).toContain("previousWebHashRef.current = routeHash");
    expect(route).toContain("if (!routeHash && !previousHash) return");
    expect(route).toContain('section === "overview" ? "country-overview" : section');
    expect(route).toContain('document.getElementById(section === "overview"');
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
