import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { filterCountryDirectory } from "./v3-country-directory-filters";

const countries = [
  { id: "a", name: "Aotea", short_code: "AOT", native_name: "Aotearoa", region: "Atlas" },
  { id: "b", name: "Oland", short_code: "OLA", native_name: "Ålanti", region: "Hydra" },
  { id: "c", name: "Vendia", short_code: "VEN", native_name: null, region: "Hydra" },
];

describe("V3 countries directory filters", () => {
  it("limits the participating-only view to confirmed current-edition countries", () => {
    const filtered = filterCountryDirectory(countries, {
      search: "",
      region: "all",
      participatingOnly: true,
      participatingCountryIds: new Set(["a", "c"]),
    });
    expect(filtered.map((country) => country.id)).toEqual(["a", "c"]);
  });

  it("does not treat all countries as participants when no active edition is available", () => {
    expect(
      filterCountryDirectory(countries, {
        search: "",
        region: "all",
        participatingOnly: true,
        participatingCountryIds: new Set(),
      }),
    ).toEqual([]);
  });

  it("combines participating status, search and region filters without leaking other countries", () => {
    expect(
      filterCountryDirectory(countries, {
        search: "ven",
        region: "Hydra",
        participatingOnly: true,
        participatingCountryIds: new Set(["a", "c"]),
      }).map((country) => country.id),
    ).toEqual(["c"]);
  });

  it("preserves the complete directory and native-name search when participating-only is disabled", () => {
    expect(
      filterCountryDirectory(countries, {
        search: "",
        region: "all",
        participatingOnly: false,
        participatingCountryIds: new Set(["a"]),
      }).map((country) => country.name),
    ).toEqual(["Aotea", "Oland", "Vendia"]);
    expect(
      filterCountryDirectory(countries, {
        search: "ålanti",
        region: "all",
        participatingOnly: false,
        participatingCountryIds: new Set(),
      }).map((country) => country.id),
    ).toEqual(["b"]);
  });

  it("uses one consistent directory for the full current lineup and the country archive", () => {
    const source = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");
    expect(source).toContain("filterCountryDirectory(countriesQuery.data ?? []");
    expect(source).toContain("participatingCountryIds");
    expect(source).toContain("participatingOnly: participatingOnly && Boolean(activeEdition)");
    expect(source).toContain("participatingOnly && activeEdition ? filtered : filtered.slice(0, visibleCount)");
    expect(source).toContain('aria-label="Country collections"');
    expect(source).toContain("aria-pressed={participatingOnly}");
    expect(source).toContain("aria-pressed={!participatingOnly}");
    expect(source).toContain("setParticipatingOnly(true)");
    expect(source).toContain("setParticipatingOnly(false)");
    expect(source).toContain('<CountryTile key={country.id} country={country} />');
    expect(source).toContain('className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"');
    expect(source).not.toContain("discovery.participating.slice(0, 9)");
    expect(source).not.toContain("<AppGroupedList>");
  });

  it("does not mutate the canonical country collection", () => {
    const originalOrder = countries.map((country) => country.id);
    filterCountryDirectory(countries, {
      search: "",
      region: "all",
      participatingOnly: false,
      participatingCountryIds: new Set(),
    });
    expect(countries.map((country) => country.id)).toEqual(originalOrder);
  });
});
