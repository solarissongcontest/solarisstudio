import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ENCYCLOPEDIA_KIND_LABELS,
  filterEncyclopediaResults,
  parseEncyclopediaCoverage,
  parseEncyclopediaSearchRows,
} from "./v3-encyclopedia";

const route = () => readFileSync("src/routes/encyclopedia/index.tsx", "utf8");

describe("V3 Encyclopedia bounded reference search", () => {
  it("parses only known publication-safe reference result kinds", () => {
    const rows = parseEncyclopediaSearchRows([
      {
        result_id: "entry:1",
        result_type: "entry",
        title: "Artist — Song",
        subtitle: "Oland · SSC 22",
        href: "/countries/ola",
      },
      {
        result_id: "wiki:1",
        result_type: "wiki",
        title: "Oland in the Wiki",
        subtitle: "Detailed country article",
        href: "/wiki/ola",
      },
      {
        result_id: "future:1",
        result_type: "future-provider",
        title: "Not yet owned by Encyclopedia",
        subtitle: "",
        href: "/future",
      },
      {
        result_id: "entry:1",
        result_type: "entry",
        title: "Duplicate",
        subtitle: "",
        href: "/countries/ola",
      },
    ]);

    expect(rows).toEqual([
      {
        id: "entry:1",
        kind: "entry",
        title: "Artist — Song",
        subtitle: "Oland · SSC 22",
        href: "/countries/ola",
      },
      {
        id: "wiki:1",
        kind: "wiki",
        title: "Oland in the Wiki",
        subtitle: "Detailed country article",
        href: "/wiki/ola",
      },
    ]);
    expect(filterEncyclopediaResults(rows, "wiki")).toHaveLength(1);
    expect(ENCYCLOPEDIA_KIND_LABELS.entry).toBe("Entries");
  });

  it("fails closed on malformed known results or unsafe links", () => {
    expect(() =>
      parseEncyclopediaSearchRows([
        {
          result_id: "show:1",
          result_type: "show",
          title: "Grand Final",
          subtitle: "SSC 22",
          href: "https://example.test/leak",
        },
      ]),
    ).toThrow(/unsafe href/);

    expect(() =>
      parseEncyclopediaSearchRows([
        {
          result_id: "entry:1",
          result_type: "entry",
          title: "",
          subtitle: "SSC 22",
          href: "/countries/ola",
        },
      ]),
    ).toThrow(/missing title/);
  });

  it("requires complete non-negative aggregate coverage evidence", () => {
    expect(
      parseEncyclopediaCoverage({
        countries: 66,
        entries: 780,
        shows: 42,
        stories: 18,
      }),
    ).toEqual({ countries: 66, entries: 780, shows: 42, stories: 18 });

    expect(() =>
      parseEncyclopediaCoverage({
        countries: 66,
        entries: -1,
        shows: 42,
        stories: 18,
      }),
    ).toThrow(/entries count/);
  });

  it("uses bounded canonical public projections instead of downloading the archive", () => {
    const source = route();

    expect(source).toContain('rpc("solaris_public_search"');
    expect(source).toContain("result_limit: 50");
    expect(source).toContain("normalizedQuery.length >= 2");
    expect(source).toContain('rpc("v3_public_explore_counts")');
    expect(source).toContain('"public_encyclopedia"');
    expect(source).toContain("search.artist ?? \"\"");

    expect(source).not.toContain("useAllParticipants");
    expect(source).not.toContain("useAllShows");
    expect(source).not.toContain("useCountries");
    expect(source).not.toContain("useEditions");
    expect(source).not.toContain("buildPublicCountryArchive");
    expect(source).not.toContain('select("*")');
    expect(source).not.toContain("refetchInterval");
  });

  it("fails search independently without falling back to raw private/archive data", () => {
    const source = route();

    expect(source).toContain("Reference search is temporarily unavailable");
    expect(source).toContain("No private archive data");
    expect(source).toContain("referenceQuery.refetch()");
    expect(source).toContain("Archive totals are temporarily unavailable");
  });
});
