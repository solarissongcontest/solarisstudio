import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed app archive loading policy", () => {
  it("keeps Country directory identity-first in installed mode", () => {
    const countries = source("src/routes/countries/index.tsx");
    const appStart = countries.indexOf("function AppCountriesPage()");
    const webStart = countries.indexOf("function WebCountriesPage()");
    const app = countries.slice(appStart, webStart);

    expect(app).toContain("useCountries()");
    expect(app).not.toContain("useAllParticipants()");
    expect(app).not.toContain("useAllResults()");
    expect(app).not.toContain("useAllJuryVotes()");
    expect(app).not.toContain("useAllTelevotes()");
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
