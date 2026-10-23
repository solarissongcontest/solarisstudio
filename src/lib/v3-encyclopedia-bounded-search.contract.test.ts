import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = () => readFileSync("src/routes/encyclopedia/index.tsx", "utf8");

describe("V3 Encyclopedia bounded reference search", () => {
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

  it("keeps public result parsing fail-closed and internal-link only", () => {
    const source = route();

    expect(source).toContain('new Set<ResultKind>(["edition", "country", "entry", "show", "wiki"])');
    expect(source).toContain('!href.startsWith("/") || href.startsWith("//")');
    expect(source).toContain('throw new Error("Invalid public Encyclopedia result")');
    expect(source).toContain('throw new Error("Invalid public archive coverage")');
    expect(source).toContain('entry: "Entries"');
  });

  it("fails search independently without falling back to raw private/archive data", () => {
    const source = route();

    expect(source).toContain("Reference search is temporarily unavailable");
    expect(source).toContain("No private archive data");
    expect(source).toContain("referenceQuery.refetch()");
    expect(source).toContain("Archive totals are temporarily unavailable");
  });
});
