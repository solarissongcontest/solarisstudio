import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed app archive loading policy", () => {
  it("keeps Country discovery off the full archive fan-out", () => {
    const route = source("src/routes/countries/index.tsx");
    const countries = source("src/components/v3/V3CountriesDiscoveryScreen.tsx");

    expect(route).toContain("V3CountriesDiscoveryScreen");
    expect(countries).toContain("usePublicEditionParticipants(activeEdition?.id)");
    expect(countries).not.toContain("useAllParticipants");
    expect(countries).not.toContain("useAllResults");
    expect(countries).not.toContain("useAllJuryVotes");
    expect(countries).not.toContain("useAllTelevotes");
  });

  it("defers full Country and Wiki archives until after identity paint", () => {
    const country = source("src/routes/countries/$code.tsx");
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");

    expect(country).toContain("archiveEnabled");
    expect(country).toContain("{ enabled: archiveEnabled }");
    expect(wiki).toContain("archiveEnabled");
    expect(wiki).toContain("{ enabled: archiveEnabled }");
  });

  it("renders edition detail from edition-scoped results before historical stories", () => {
    const edition = source("src/routes/editions/$slug.tsx");
    const data = source("src/lib/data.ts");

    expect(data).toContain("export function useEditionResults");
    expect(data).toContain('"results",\n      "edition"');
    expect(edition).toContain("useEditionResults(edition?.id)");
    expect(edition).toContain("useAllResults({ enabled: historyEnabled })");
    expect(edition).toContain("useAllShows({ enabled: historyEnabled })");
    expect(edition).toContain("const resultList = editionResults ?? []");
  });

  it("keeps deferable full-archive hooks cache-compatible", () => {
    const data = source("src/lib/data.ts");
    const live = source("src/lib/data-live.ts");

    expect(data).toContain('enabled: options?.enabled ?? true');
    expect(live).toContain('enabled: options?.enabled ?? true');
    expect(data).toContain('"results",\n      "all"');
    expect(data).toContain('"shows",\n      "all"');
  });
});