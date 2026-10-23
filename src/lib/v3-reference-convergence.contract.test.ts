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
    expect(source).toContain('<Navigate to="/encyclopedia" replace />');
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
    expect(source).toContain('buildPublicCountryArchive({');
    expect(source).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(source).toContain('to="/countries"');
    expect(source).not.toContain('to="/wiki"');
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
