import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/televote/$slug.tsx", "utf8");

describe("S08 Organizer Televote total write-boundary retirement", () => {
  it("removes the legacy non-atomic raw totals writer and its false review controls", () => {
    expect(route).not.toContain('supabase.from("televote_votes")');
    expect(route).not.toContain('.update({ points:');
    expect(route).not.toContain('.insert({');
    expect(route).not.toContain("mutationPhaseStarted");
    expect(route).not.toContain("setPendingReview");
    expect(route).not.toContain("AdminConfirmSheet");
    expect(route).not.toContain("onClick={requestSave}");
    expect(route).toContain("<output");
  });

  it("preserves official negative deductions as read-only source data", () => {
    expect(route).toContain("points < 0");
    expect(route).toContain("Sanction");
    expect(route).toContain("useTelevotes(selectedShow?.id)");
    expect(route).toContain("This screen cannot write official totals.");
  });

  it("keeps corrections with their existing Televoting owner, not a new RPC", () => {
    expect(route).toContain('to="/televoting/admin/combined"');
    expect(route).toContain("Open Televoting corrections");
    expect(route).toContain("Select and verify the correct edition, show and aggregation");
    expect(route).not.toContain("reconcileOrganizerTelevoteTotals");
    expect(route).not.toContain("executeGovernedTelevoteTotalsCommand");
    expect(route).not.toContain('search={{ editionId: edition.id, showId: selectedShow?.id, view: "corrections" }}');
  });
});
