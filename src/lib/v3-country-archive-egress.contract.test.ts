import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/countries/$code.tsx", "utf8");

describe("Country public archive request budget", () => {
  it("does not load ballot-level jury/televote archives for the ordinary overview", () => {
    expect(route).toContain('tab === "voting" || tab === "relationships" || tab === "form"');
    expect(route).toContain("useAllJuryVotes({ enabled: archiveEnabled && needsDetailedVotes })");
    expect(route).toContain("useAllTelevotes({ enabled: archiveEnabled && needsDetailedVotes })");
    expect(route).toContain("...(needsDetailedVotes ? [juryQuery, televoteQuery] : [])");
  });

  it("keeps the published and spoiler-safe Country archive as the only analytics source", () => {
    expect(route).toContain("buildPublicCountryArchive({");
    expect(route).toContain("jury: jury ?? []");
    expect(route).toContain("televote: televote ?? []");
    expect(route).toContain("computeCanonicalCountryStats(country.id, opts)");
    expect(route).toContain('country && tab === "form" ? computeCountryForm(country.id, opts) : null');
    expect(route).toContain("computeCanonicalHeadToHead(country.id, id, opts)");
  });
});
