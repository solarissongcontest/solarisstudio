import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyOrganizerEntryReview,
  deriveOrganizerResponseReviewState,
  hasOutdatedOrganizerEntryReview,
  hasOutdatedOrganizerResponseReview,
  hasCurrentOrganizerResponseReviewDecision,
  describeOrganizerNationalFinalQueue,
  type OrganizerResponseReviewEvidence,
} from "./v3-organizer-entry-review-status";

const accepted = (id = "entry-v2") => ({
  id: "entry-1",
  song_title: "Solaris Song",
  review_status: "accepted",
  current_version_id: id,
  reviewed_version_id: id,
});

const internal = (entry: OrganizerResponseReviewEvidence["internal_entries"]): OrganizerResponseReviewEvidence => ({
  participating: true,
  selection_method: "internal",
  entry_unknown: false,
  nf_entries_unknown: false,
  internal_entries: entry,
  national_finals: null,
});

const nationalFinal = (
  entries: NonNullable<OrganizerResponseReviewEvidence["national_finals"]>["national_final_entries"],
  winner: string | null,
): OrganizerResponseReviewEvidence => ({
  participating: true,
  selection_method: "national_final",
  entry_unknown: false,
  nf_entries_unknown: false,
  internal_entries: null,
  national_finals: { winning_entry_id: winner, national_final_entries: entries },
});

describe("Organizer Entry Review current-version queue", () => {
  it("counts only an exact current immutable-version acceptance as ready", () => {
    expect(deriveOrganizerResponseReviewState(internal(accepted()))).toBe("ready");
    expect(deriveOrganizerResponseReviewState(internal({
      ...accepted("entry-v2"),
      reviewed_version_id: "entry-v1",
    }))).toBe("review");
    expect(deriveOrganizerResponseReviewState(internal({
      ...accepted("entry-v2"),
      reviewed_version_id: null,
    }))).toBe("review");
    expect(deriveOrganizerResponseReviewState(internal({
      ...accepted("entry-v2"),
      current_version_id: null,
    }))).toBe("review");
  });

  it("does not inherit approval when an identical-song new version is submitted", () => {
    const oldDecision = { ...accepted("entry-v3"), reviewed_version_id: "entry-v2" };
    expect(classifyOrganizerEntryReview(oldDecision)).toBe("needs_review");
    expect(hasOutdatedOrganizerEntryReview(oldDecision)).toBe(true);
    expect(hasOutdatedOrganizerEntryReview(accepted())).toBe(false);
  });

  it("distinguishes a current requested correction from a stale or unbound decline", () => {
    const declined = { ...accepted(), review_status: "declined" };
    expect(deriveOrganizerResponseReviewState(internal(declined))).toBe("issue");
    expect(deriveOrganizerResponseReviewState(internal({
      ...declined, reviewed_version_id: "entry-v1",
    }))).toBe("review");
    expect(deriveOrganizerResponseReviewState(internal({
      ...declined, reviewed_version_id: null,
    }))).toBe("review");
  });

  it("never marks a mixed-version National Final ready, even with a winner", () => {
    expect(deriveOrganizerResponseReviewState(nationalFinal([
      accepted(), { ...accepted(), id: "entry-2", reviewed_version_id: "entry-v1" },
    ], "entry-1"))).toBe("review");
    expect(deriveOrganizerResponseReviewState(nationalFinal([
      accepted(), { ...accepted(), id: "entry-2", review_status: "declined" },
    ], "entry-1"))).toBe("issue");
  });

  it("requires the winner to be one of the currently accepted active candidates", () => {
    const entries = [accepted(), { ...accepted(), id: "entry-2" }];
    expect(deriveOrganizerResponseReviewState(nationalFinal(entries, null))).toBe("neutral");
    expect(deriveOrganizerResponseReviewState(nationalFinal(entries, "foreign-entry"))).toBe("neutral");
    expect(deriveOrganizerResponseReviewState(nationalFinal(entries, "entry-2"))).toBe("ready");
  });

  it("does not count removed, absent, or unknown-selection candidates as ready", () => {
    expect(classifyOrganizerEntryReview({ ...accepted(), removed: true })).toBe("removed");
    expect(deriveOrganizerResponseReviewState(internal({ ...accepted(), removed: true }))).toBe("issue");
    expect(deriveOrganizerResponseReviewState(internal(null))).toBe("neutral");
    expect(deriveOrganizerResponseReviewState({
      ...internal(accepted()), entry_unknown: true,
    })).toBe("neutral");
    expect(deriveOrganizerResponseReviewState({
      ...internal(accepted()), participating: false,
    })).toBe("neutral");
    expect(deriveOrganizerResponseReviewState({
      ...internal(accepted()), selection_method: "future_selection",
    })).toBe("neutral");
  });

  it("finds stale current-selection review evidence without using another selection", () => {
    const stale = { ...accepted(), reviewed_version_id: "entry-v1" };
    expect(hasOutdatedOrganizerResponseReview(internal(stale))).toBe(true);
    expect(hasOutdatedOrganizerResponseReview(internal(accepted()))).toBe(false);
    expect(hasOutdatedOrganizerResponseReview({
      ...internal(stale), selection_method: "national_final",
    })).toBe(false);
    expect(hasOutdatedOrganizerResponseReview({
      ...internal(stale), participating: false,
    })).toBe(false);
  });

  it("ignores removed and unknown NF candidates but catches any active stale review", () => {
    const entries = [
      accepted(),
      { ...accepted(), id: "entry-2", reviewed_version_id: "entry-v1" },
    ];
    expect(hasOutdatedOrganizerResponseReview(nationalFinal(entries, "entry-1"))).toBe(true);
    expect(hasOutdatedOrganizerResponseReview(nationalFinal([
      { ...entries[1], removed: true },
    ], null))).toBe(false);
    expect(hasOutdatedOrganizerResponseReview(nationalFinal([
      { ...entries[1], review_status: "removed" },
    ], null))).toBe(false);
    expect(hasOutdatedOrganizerResponseReview({
      ...nationalFinal(entries, "entry-1"), nf_entries_unknown: true,
    })).toBe(false);
  });

  it("requires a known Entry before treating historical internal review as actionable", () => {
    const stale = { ...accepted(), reviewed_version_id: "entry-v1" };
    expect(hasOutdatedOrganizerResponseReview({
      ...internal(stale), entry_unknown: true,
    })).toBe(false);
    expect(hasOutdatedOrganizerResponseReview({
      ...internal(stale), selection_method: null,
    })).toBe(false);
  });

  it("does not surface withdrawn or unknown selections in accepted/declined filters", () => {
    const acceptedEntry = internal(accepted());
    expect(hasCurrentOrganizerResponseReviewDecision(acceptedEntry,"internal","accepted")).toBe(true);
    expect(hasCurrentOrganizerResponseReviewDecision({
      ...acceptedEntry, participating: false,
    },"internal","accepted")).toBe(false);
    expect(hasCurrentOrganizerResponseReviewDecision({
      ...acceptedEntry, entry_unknown: true,
    },"internal","accepted")).toBe(false);
    expect(hasCurrentOrganizerResponseReviewDecision({
      ...acceptedEntry, selection_method: "national_final",
    },"internal","accepted")).toBe(false);
    expect(hasCurrentOrganizerResponseReviewDecision(
      internal({ ...accepted(), song_title: null }),"internal","accepted",
    )).toBe(false);
  });

  it("never accepts old or missing immutable review bindings in the filters", () => {
    const stale = { ...accepted(), reviewed_version_id: "old-version" };
    expect(hasCurrentOrganizerResponseReviewDecision(
      internal(stale), "internal", "accepted",
    )).toBe(false);
    expect(hasCurrentOrganizerResponseReviewDecision(
      nationalFinal([stale], "entry-1"), "national_final", "accepted",
    )).toBe(false);
    expect(hasCurrentOrganizerResponseReviewDecision(
      nationalFinal([{ ...accepted(), review_status: "declined" }], null),
      "national_final", "declined",
    )).toBe(true);
  });

  it("does not count unknown/removed NF candidates as current approvals", () => {
    const nf = nationalFinal([accepted(), { ...accepted(), id:"two", removed:true }], "entry-1");
    expect(hasCurrentOrganizerResponseReviewDecision(nf,"national_final","accepted")).toBe(true);
    expect(hasCurrentOrganizerResponseReviewDecision({
      ...nf, nf_entries_unknown: true,
    },"national_final","accepted")).toBe(false);
    expect(hasCurrentOrganizerResponseReviewDecision({
      ...nf, participating: false,
    },"national_final","accepted")).toBe(false);
  });

  it("does not call a withdrawn or foreign National Final winner selected", () => {
    expect(describeOrganizerNationalFinalQueue(
      nationalFinal([accepted()], "wrong"),
    )).toMatch(/no longer an active candidate/);
    expect(describeOrganizerNationalFinalQueue(
      nationalFinal([{...accepted(),removed:true}],"entry-1"),
    )).toBe("No active National Final candidates");
    expect(describeOrganizerNationalFinalQueue({
      ...nationalFinal([accepted()],"entry-1"), nf_entries_unknown:true,
    })).toMatch(/not confirmed/);
  });

  it("distinguishes stale, declined, selected and missing National Final winners", () => {
    expect(describeOrganizerNationalFinalQueue(
      nationalFinal([accepted(), {...accepted(),id:"two",reviewed_version_id:"old"}],"entry-1"),
    )).toMatch(/reviews still incomplete/);
    expect(describeOrganizerNationalFinalQueue(
      nationalFinal([{...accepted(),review_status:"declined"}],"entry-1"),
    )).toMatch(/corrections/);
    expect(describeOrganizerNationalFinalQueue(
      nationalFinal([accepted()],"entry-1"),
    )).toMatch(/all active Entries accepted/);
    expect(describeOrganizerNationalFinalQueue(
      nationalFinal([accepted()],null),
    )).toMatch(/waiting for National Final winner/);
    expect(describeOrganizerNationalFinalQueue({
      ...nationalFinal([accepted()],"entry-1"), participating:false,
    })).toBeNull();
  });

  it("keeps the summary and current-decision filters in the Organizer queue", () => {
    const route = readFileSync(
      resolve(process.cwd(),"src/routes/confirmations/admin/responses.tsx"),"utf8",
    );
    expect(route).toContain("hasCurrentOrganizerResponseReviewDecision(");
    expect(route).toContain("describeOrganizerNationalFinalQueue(row)");
    expect(route).not.toContain('nf?.winning_entry_id ? "National Final winner selected"');
  });

  it("does not confer acceptance from legacy, missing or unknown review evidence", () => {
    expect(classifyOrganizerEntryReview({ review_status: "accepted" })).toBe("needs_review");
    expect(classifyOrganizerEntryReview({ review_status: "unexpected" })).toBe("needs_review");
    expect(classifyOrganizerEntryReview({ review_status: "pending" })).toBe("needs_review");
    expect(deriveOrganizerResponseReviewState(nationalFinal([
      { ...accepted(), reviewed_version_id: null },
    ], "entry-1"))).toBe("review");
  });
});
