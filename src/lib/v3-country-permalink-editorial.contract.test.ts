import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  effectiveParticipatingScope,
  filterCountryDirectory,
  shouldHoldCountryLineupUrlScope,
} from "./v3-country-directory-filters";
import { parseCountryDirectoryUrlSearch } from "./v3-explore-browse-url";

describe("V3 country permalink, publication safety and editorial reconciliation", () => {
  it("normalizes shareable public country filters but rejects invalid URL state", () => {
    expect(parseCountryDirectoryUrlSearch({
      q: "  Ålanti   Oland  ", region: "North  Hydra", scope: "participants",
    })).toEqual({ q: "Ålanti Oland", region: "North Hydra", scope: "participants" });
    expect(parseCountryDirectoryUrlSearch({
      q: ["private"], region: "x".repeat(200), scope: "editor",
    })).toEqual({ q: undefined, region: undefined, scope: undefined });
  });

  it("keeps requested participant scope during incomplete public edition/lineup reads", () => {
    expect(shouldHoldCountryLineupUrlScope(true, false, false)).toBe(true);
    expect(shouldHoldCountryLineupUrlScope(true, true, true)).toBe(true);
    expect(shouldHoldCountryLineupUrlScope(true, true, false)).toBe(false);
    expect(shouldHoldCountryLineupUrlScope(false, false, true)).toBe(false);
    expect(effectiveParticipatingScope(true, false)).toBe(false);
    expect(effectiveParticipatingScope(true, true)).toBe(true);
  });

  it("searches only permitted published countries and handles regional accents", () => {
    const countries = [
      { id: "ola", name: "Oland", native_name: "Ålanti", short_code: "OLA", region: "Hydra" },
      { id: "orn", name: "Ørnådal", native_name: "", short_code: "ORN", region: "Electra" },
    ];
    expect(filterCountryDirectory(countries, {
      search: "alanti hydra", region: "all", participatingOnly: false,
      participatingCountryIds: new Set<string>(),
    }).map(c => c.id)).toEqual(["ola"]);
    expect(filterCountryDirectory(countries, {
      search: "", region: "all", participatingOnly: true,
      participatingCountryIds: new Set(["orn"]),
    }).map(c => c.id)).toEqual(["orn"]);
  });

  it("retains #2602 Country UX and prevents stale participant movement during refresh", () => {
    const route = readFileSync("src/routes/countries/index.tsx", "utf8");
    const screen = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");
    expect(route).toContain("validateSearch: parseCountryDirectoryUrlSearch");
    expect(route).toContain("Route.useSearch()");
    expect(route).toContain("Route.useNavigate()");
    expect(route).toContain("replace: true");
    expect(route).toContain('presentation="installed-app"');
    expect(screen).toContain("v3-editorial-country-index");
    expect(screen).toContain('className="v3-countries-browser scroll-mt-24"');
    expect(screen).toContain('eyebrow="Current movement"');
    expect(screen.indexOf('className="v3-countries-browser scroll-mt-24"'))
      .toBeLessThan(screen.indexOf('eyebrow="Current movement"'));
    expect(screen).toContain("shouldHoldCountryLineupUrlScope(");
    expect(screen).toContain("currentLineupReady && movementGroups.length > 0");
    expect(screen).toContain("verifyingRequestedLineup");
    expect(screen).toContain("ArchiveDataLoading label=\"Verifying published participant lineup");
    expect(screen).toContain("participantsQuery.isSuccess ? participantsQuery.data ?? [] : []");
    expect(screen).toContain("region: effectiveRegion");
    expect(screen).toContain("value={effectiveRegion}");
    expect(screen).not.toContain("useAllResults");
    expect(screen).not.toContain("useAllJuryVotes");
    expect(screen).not.toContain("v3-countries-current-pulse");
  });
});
