import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/confirmations/admin/sync.tsx");

describe("V3 Organizer Confirmation line-up sync review", () => {
  it("requires an explicit exact-target review before starting the legacy multi-step sync", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("PendingLineupSyncReview");
    expect(route).toContain("openSyncReview");
    expect(route).toContain('onClick={openSyncReview}');
    expect(route).toContain('confirmationText={pendingSyncReview?.showName}');
    expect(route).not.toContain('onClick={() => void runSync()}');
  });

  it("captures exact edition, round, target show and response identities in the review", () => {
    expect(route).toContain("editionId: organizerEditionId");
    expect(route).toContain("roundId: selectedRound.id");
    expect(route).toContain("showId: selectedShow.id");
    expect(route).toContain("responseIds: selectedRows.map((row) => row.id).sort()");
    expect(route).toContain("countries: selectedRows.map((row) => row.country)");
  });

  it("re-reads both Confirmation responses and Solaris targets before applying", () => {
    expect(route).toContain('confirmationsSupabase.rpc("admin_confirmation_responses")');
    expect(route).toContain("const liveResponseIds = liveRows.map((row) => row.id).sort()");
    expect(route).toContain("const liveTargets = await getTargets");
    expect(route).toContain("const liveShow = liveTargets.shows.find((show) => show.id === review.showId)");
    expect(route).toContain("The participating Confirmation responses changed while this review was open");
    expect(route).toContain("The reviewed target show changed or is no longer available");
  });

  it("does not pretend the current legacy boundary is atomic or receipted", () => {
    expect(route).toContain("legacy multi-step sync boundary");
    expect(route).toContain("System #598 remains the blocker");
    expect(route).toContain("partial progress");
  });
});
