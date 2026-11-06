import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/integrations/v3/broadcast-intelligence-source.server.ts",
  ),
  "utf8",
);

describe("V3 Broadcast Intelligence immutable published Result authority", () => {
  it("uses the selected Show's canonical immutable published Result snapshot", () => {
    expect(source).toContain(
      'import { loadV3PublishedResultSnapshot } from "@/integrations/v3/public-result-snapshot.server"',
    );
    expect(source).toContain("loadV3PublishedResultSnapshot(selectedShow.id)");
    expect(source).not.toContain('.from("results")');
    expect(source).not.toContain("RESULT_COLUMNS");
  });

  it("fails closed instead of falling back when immutable publication evidence is unavailable", () => {
    expect(source).toContain("if (!snapshot)");
    expect(source).toContain(
      "if (!snapshot.availability.jury || !snapshot.availability.televote)",
    );
    expect(source).toContain(
      "Canonical published Result snapshot escaped the selected Edition scope",
    );
    expect(source).toContain(
      "Canonical published Result snapshot is missing public split points",
    );
  });

  it("builds broadcast inputs directly from immutable official score fields", () => {
    expect(source).toContain(
      'const id = row.contestEntityId ?? row.countryId ?? ""',
    );
    expect(source).toContain("juryPoints: row.juryPoints");
    expect(source).toContain("televotePoints: row.televotePoints");
    expect(source).toContain("totalPoints: row.totalPoints");
    expect(source).toContain("officialRank: row.finalRank");
    expect(source).toContain("buildBroadcastIntelligence(entries)");
  });

  it("does not let current participant status rewrite already-published history", () => {
    expect(source).not.toContain("public_safe_participants");
    expect(source).not.toContain("filterNonCompetingRows");
    expect(source).not.toContain('participation_status === "withdrawn"');
    expect(source).not.toContain('participation_status === "disqualified"');
  });

  it("does not fan out immutable Result snapshot reads across the Show option list", () => {
    expect(source.match(/loadV3PublishedResultSnapshot\(/g)?.length ?? 0).toBe(1);
    expect(source).toContain("loadV3PublishedResultSnapshot(selectedShow.id)");
    expect(source).not.toContain("Promise.all(eligibleShows.map");
  });
});
