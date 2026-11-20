import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Live Result publication boundary", () => {
  it("requires the strict immutable published-Result adapter when metadata exposes results", () => {
    const source = read("src/integrations/v3/live-source.server.ts");

    expect(source).toContain("loadV3PublishedResultSnapshot");
    expect(source).toContain("publication.results");
    expect(source).toContain("loadV3PublishedResultSnapshot(selectedShow.id)");
    expect(source).toContain("resultsPublished: publishedResult !== null");
    expect(source).toContain("publishedResult.edition.id !== edition.id");
    expect(source).not.toContain('.from("results")');
  });

  it("does not fetch an immutable Result payload before publication metadata nominates the transition", () => {
    const source = read("src/integrations/v3/live-source.server.ts");

    expect(source).toContain("publication.results\n      ? loadV3PublishedResultSnapshot(selectedShow.id)\n      : Promise.resolve(null)");
  });

  it("keeps metadata-only publication pending rather than claiming an official result", () => {
    const projection = read("src/lib/v3-live.ts");

    expect(projection).toContain('companion.phase === "results_published"');
    expect(projection).toContain('return input.resultsPublished ? "complete" : "results_pending"');
    expect(projection).toContain("publicationClaimUnverified");
    expect(projection).toContain('stateLabel:\n      publicationClaimUnverified && state === "results_pending"');
    expect(projection).toContain("resultsPublished: input.resultsPublished");
    expect(projection).not.toContain("resultsPublished: companion.resultsPublished");
  });

  it("keeps immutable publication identity in the Live freshness version", () => {
    const projection = read("src/lib/v3-live.ts");

    expect(projection).toContain('input.resultsPublished ? "results-public" : "results-hidden"');
    expect(projection).toContain("resultsPublished: input.resultsPublished");
  });
});
