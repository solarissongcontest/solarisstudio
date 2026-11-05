import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { countryDirectoryRegionOptions, filterCountryDirectory } from "./v3-country-directory-filters";

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

  it("matches canonical, native and regional names without requiring the user's keyboard to type accents", () => {
    const fixture = [...countries, { id: "d", name: "Ørnådal", short_code: "ORN", region: "Electra" }];
    expect(filterCountryDirectory(fixture, {
      search: "alanti", region: "all", participatingOnly: false, participatingCountryIds: new Set(),
    }).map((country) => country.id)).toEqual(["b"]);
    expect(filterCountryDirectory(fixture, {
      search: "ornadal", region: "all", participatingOnly: false, participatingCountryIds: new Set(),
    }).map((country) => country.id)).toEqual(["d"]);
    expect(filterCountryDirectory(fixture, {
      search: "ola", region: "all", participatingOnly: false, participatingCountryIds: new Set(),
    }).map((country) => country.id)).toEqual(["b"]);
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

  it("keeps uncategorised countries filterable and region facets scoped to the chosen collection", () => {
    const fixture = [
      ...countries,
      { id: "d", name: "Norzea", short_code: "NOR", region: null },
      { id: "e", name: "Yaria", short_code: "YAR", region: " Hydra " },
    ];
    const currentIds = new Set(["b", "e"]);
    expect(countryDirectoryRegionOptions(fixture, {
      participatingOnly: false,
      participatingCountryIds: currentIds,
    })).toEqual([
      { name: "Atlas", count: 1 },
      { name: "Hydra", count: 3 },
      { name: "Other", count: 1 },
    ]);
    expect(countryDirectoryRegionOptions(fixture, {
      participatingOnly: true,
      participatingCountryIds: currentIds,
    })).toEqual([{ name: "Hydra", count: 2 }]);
    expect(filterCountryDirectory(fixture, {
      search: "",
      region: "Other",
      participatingOnly: false,
      participatingCountryIds: currentIds,
    }).map((country) => country.id)).toEqual(["d"]);
    expect(filterCountryDirectory(fixture, {
      search: "hydra",
      region: "all",
      participatingOnly: false,
      participatingCountryIds: currentIds,
    }).map((country) => country.id)).toEqual(["b", "c", "e"]);
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
    expect(source).toContain('<CountryTile key={country.id} country={country} presentation={presentation} />');
    expect(source).toContain('"v3-countries-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"');
    expect(source).not.toContain("discovery.participating.slice(0, 9)");
    expect(source).not.toContain("<AppGroupedList>");
  });

  it("keeps all-country discovery accessible when current-edition data is unavailable", () => {
    const source = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");
    expect(source).toContain("(participatingOnly && pendingCurrentParticipants)");
    expect(source).toContain("(participatingOnly && participantsQuery.isError)");
    expect(source).toContain("disabled={!currentLineupReady}");
    expect(source).toContain("Retry lineup");
    expect(source).toContain("You can still browse all countries.");
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
