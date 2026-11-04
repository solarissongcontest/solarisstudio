import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const wikiRoot = () => read("src/routes/wiki/index.tsx");
const wikiCountry = () => read("src/routes/wiki/$code.tsx");
const reference = () => read("src/routes/encyclopedia/index.tsx");

describe("V3 Reference convergence", () => {
  it("moves the installed-app Wiki root into the rolled-out Reference product", () => {
    const source = wikiRoot();

    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('enabled: isAppMode');
    expect(source).toContain('referenceRollout.data === true');
    expect(source).toContain('<Navigate to="/encyclopedia" search={{ artist: undefined }} replace />');
  });

  it("keeps the legacy Wiki root available when Reference is not safely rolled out", () => {
    const source = wikiRoot();

    expect(source).toContain('return isAppMode ? <AppWikiIndexPage /> : <WebWikiIndexPage />');
    expect(source).toContain('referenceRollout.isError');
    expect(source).toContain('referenceRollout.isLoading');
  });

  it("routes rolled-out app Wiki country articles to canonical Country identity", () => {
    const source = wikiCountry();

    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('referenceRollout.data === true');
    expect(source).toContain('<Navigate to="/countries/$code" params={{ code }} replace />');
  });

  it("preserves external Wiki compatibility until the rollout is complete", () => {
    const source = wikiCountry();

    expect(source).toContain('<CountryWikiExperience code={code} />');
    expect(source).toContain('https://studio.solaris-song-contest.workers.dev/wiki/');
    expect(source).toContain('referenceRollout.isError');
  });

  it("presents Encyclopedia as one clear publication-safe Reference product", () => {
    const source = reference();

    expect(source).toContain('{ title: "Reference — Solaris Studio" }');
    expect(source).toContain('title="Reference"');
    expect(source).toContain('aria-label="Filter Reference"');
    expect(source).toContain('rpc(\n        "solaris_public_search"');
    expect(source).toContain('rpc(\n        "v3_public_explore_counts"');
    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('to="/countries"');
    expect(source).not.toContain('to="/wiki"');
  });

  it("keeps Reference reads bounded instead of downloading the archive graph", () => {
    const source = reference();

    expect(source).toContain("normalizedQuery.length >= 2");
    expect(source).toContain("result_limit: 50");
    expect(source).toContain("60 * 60 * 1000");
    expect(source).toContain("Reference search is temporarily unavailable");
    expect(source).toContain("No private archive data");
    expect(source).not.toContain("useAllParticipants");
    expect(source).not.toContain("useAllShows");
    expect(source).not.toContain("useCountries");
    expect(source).not.toContain("useEditions");
    expect(source).not.toContain("buildPublicCountryArchive");
    expect(source).not.toContain('select("*")');
    expect(source).not.toContain("refetchInterval");
  });

  it("does not create a new browser-owned publication or mutation authority", () => {
    const source = reference();

    expect(source).not.toContain('.from("');
    expect(source).not.toContain(".from('");
    expect(source).not.toContain("insert(");
    expect(source).not.toContain("update(");
    expect(source).not.toContain("delete(");
  });
});
