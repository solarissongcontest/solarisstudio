import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reference = readFileSync("src/routes/encyclopedia/index.tsx", "utf8");
const style = readFileSync("src/styles/v3-reference-directory.css", "utf8");
const parser = readFileSync("src/lib/v3-reference-search-rows.ts", "utf8");

describe("V3 Reference publication and editorial parity", () => {
  it("never links to an unreleased browse destination or cached search result", () => {
    expect(reference).toContain("usePublicLaunchAvailability()");
    expect(reference).toContain("allowsReleased(destination.href)");
    expect(reference).toContain("allowsReleased(item.href)");
    expect(reference).toContain('allowsReleased("/countries")');
    expect(reference).toContain("referenceReleased && !dedicatedTopicOnly");
  });

  it("fails closed while its feature flag is being refreshed or its refresh failed", () => {
    expect(reference).toContain('isStudio2FeatureEnabled("public_encyclopedia")');
    expect(reference).toContain('refetchOnMount: "always"');
    expect(reference).toContain("!feature.isFetching");
    expect(reference).toContain("!feature.isRefetchError");
    expect(reference).toContain("if (feature.isLoading || feature.isFetching)");
    expect(reference).toContain("enabled: referenceReleased");
    expect(reference).toContain("if (!referenceReleased)");
  });

  it("keeps a single bounded published-record search and no archive-vote fallback", () => {
    expect(reference).toContain('rpc(');
    expect(reference).toContain('"solaris_public_search"');
    expect(reference).toContain("result_limit: 50");
    expect(reference).toContain("parseSearchRows");
    expect(parser).toContain("SAFE_ROUTE");
    expect(reference).not.toContain("useAllJuryVotes(");
    expect(reference).not.toContain("useAllResults(");
    expect(reference).not.toContain('from("jury_votes")');
  });

  it("keeps search before compact coverage and quiet entries in each web layout", () => {
    const controls = reference.indexOf('className="v3-reference-directory__controls"');
    const coverage = reference.indexOf('className="v3-reference-directory__coverage"');
    const index = reference.indexOf("v3-reference-directory__index");
    expect(controls).toBeGreaterThan(0);
    expect(coverage).toBeGreaterThan(controls);
    expect(index).toBeGreaterThan(coverage);
    expect(reference).toContain("v3-directory-mobile-list v3-reference-directory__index");
    expect(reference).toContain("solaris-app-grouped-list");
    expect(reference).toContain("v3-directory-desktop-rail");
    expect(style).toContain(".v3-reference-directory__coverage-list");
    expect(style).toContain(".v3-reference-directory__row");
    expect(style).toContain("@media (forced-colors: active)");
  });
});
