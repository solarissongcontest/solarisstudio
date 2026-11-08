import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/televote/$slug.tsx", "utf8");
const combinedRoute = readFileSync("src/routes/televoting/admin/combined.tsx", "utf8");
const combinedMath = readFileSync("src/integrations/televoting/combined-math.ts", "utf8");

describe("V3 Organizer Televote correction dependency", () => {
  it("routes corrections to the Televoting-owned workflow", () => {
    expect(route).toContain('to="/televoting/admin/combined"');
    expect(route).toContain(
      "Corrections, sanctions and deductions must be created and published through the Televoting correction workflow.",
    );
    expect(route).not.toContain("reconcileOrganizerTelevoteTotals");
  });

  it("preserves negative corrections and publication controls in the owner workflow", () => {
    expect(combinedRoute).toContain('["correction", "Correction"]');
    expect(combinedRoute).toContain("setMergedCombinedStatus");
    expect(combinedRoute).toContain("recalculateMergedCombined");
    expect(combinedMath).toContain(
      "finalCombinedPoints: totalVotingPoints + totalActivityPoints + finalCorrection",
    );
    expect(combinedMath).toContain("Final, reviewed point deductions must be applied in full");
  });
});
