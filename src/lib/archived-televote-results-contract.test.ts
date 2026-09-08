import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Archived Televote results", () => {
  it("routes Televote Results through the archive-aware workspace", () => {
    const route = source("routes/televoting/admin/results.tsx");
    expect(route).toContain("VotingResultsWorkspace");
    expect(route).not.toContain("component: VotingResultsView");
  });

  it("follows the Organizer-selected edition instead of the legacy all-editions catalog", () => {
    const workspace = source("components/televoting/VotingResultsWorkspace.tsx");
    expect(workspace).toContain("useAdminContext");
    expect(workspace).toContain("getMergedTelevotingRoundsPage");
    expect(workspace).toContain('["merged-televoting-results-edition", editionId]');
    expect(workspace).not.toContain('import { getMergedTelevotingRounds }');
    expect(workspace).not.toContain("useServerFn(getMergedTelevotingRounds);");
  });

  it("keeps archived editions read-only", () => {
    const workspace = source("components/televoting/VotingResultsWorkspace.tsx");
    expect(workspace).toContain("if (data.edition.is_archived)");
    expect(workspace).toContain('Read only');
    expect(workspace).toContain("Archived editions are read-only and are never recalculated automatically");
    expect(workspace).not.toContain("recalculateMergedConversion");
    expect(workspace).not.toContain("updateMergedConversionConfig");
    expect(workspace).not.toContain("setMergedResultsStatus");
  });

  it("shows preserved stored results or raw historical totals without inventing a conversion", () => {
    const workspace = source("components/televoting/VotingResultsWorkspace.tsx");
    expect(workspace).toContain("Preserved stored result");
    expect(workspace).toContain("Preserved raw totals");
    expect(workspace).toContain("No point conversion has been fabricated");
    expect(workspace).toContain("data?.originals");
    expect(workspace).toContain("data?.stored");
  });
});
