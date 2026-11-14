import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Results server sub-score publication boundary", () => {
  it("redacts Jury and Televote splits before returning the browser bundle", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain(
      "juryPoints: juryVisible ? (row.juryPoints ?? null) : null",
    );
    expect(results).toContain(
      "televotePoints: televoteVisible ? (row.televotePoints ?? null) : null",
    );
    expect(results).not.toContain(
      "juryPoints: row.jury_points,\n      televotePoints: row.televote_points",
    );
  });

  it("keeps canonical publication flags as the only sub-score disclosure authority", () => {
    const results = source("src/integrations/v3/results-source.server.ts");

    expect(results).toContain(
      "const snapshot = await loadV3PublishedResultSnapshot(selectedShow.id)",
    );
    expect(results).toContain("juryPublished: juryVisible");
    expect(results).toContain("televotePublished: televoteVisible");
    expect(results).not.toMatch(
      /localStorage|sessionStorage|Date\.now\(\).*jury|Date\.now\(\).*televote/,
    );
  });

  it("requires both immutable disclosure and actual channel enablement for published splits", () => {
    const results = source("src/integrations/v3/results-source.server.ts");
    expect(results).toContain("const voting = resolveVoting(selectedShow.voting_config)");
    expect(results).toContain("const juryVisible = snapshot.availability.jury && voting.juryEnabled");
    expect(results).toContain("const televoteVisible = snapshot.availability.televote && voting.televoteEnabled");
    expect(results).toContain("detailedVotingPublished:");
    expect(results).toContain("snapshot.availability.detailedVoting && (voting.juryEnabled || voting.televoteEnabled)");
  });
});
