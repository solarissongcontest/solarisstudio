import { describe, expect, it } from "vitest";

import {
  authoritativeNextInLineSubmissionId,
  nextInLineDraftFingerprint,
  nextInLineDuplicateKey,
  nextInLineReviewReadiness,
  resolveNextInLineDuplicateCheck,
  type NextInLineDraft,
} from "./next-in-line-review";

function draft(overrides: Partial<NextInLineDraft> = {}): NextInLineDraft {
  return {
    editionId: "edition-22",
    sourceSubmissionId: "submission-1",
    country: "Asteria",
    method: "internal",
    nationalFinalEntryId: "",
    eligibleNationalFinalEntryIds: [],
    artist: "Example artist",
    songTitle: "Example song",
    songUrl: "https://music.example/song",
    previewStart: "01:20",
    previewEnd: "01:45",
    ...overrides,
  };
}

const clearFor = (value: NextInLineDraft) => ({
  key: nextInLineDuplicateKey(value),
  status: "clear" as const,
});

describe("Next in Line exact-draft review", () => {
  it("allows valid internal submissions only after the same draft is checked", () => {
    const current = draft();
    expect(nextInLineReviewReadiness(current, clearFor(current))).toEqual({ ready: true });
    const edited = draft({ songTitle: "A different song" });
    expect(nextInLineReviewReadiness(edited, clearFor(current))).toMatchObject({
      ready: false,
      reason: expect.stringContaining("exact song"),
    });
  });

  it("rejects failed, unresolved, and partial duplicate verdicts", () => {
    const current = draft();
    const key = nextInLineDuplicateKey(current);
    for (const response of [
      null,
      { ok: false, duplicate: false, type: null },
      { ok: true, duplicate: true, type: null },
    ] as const) {
      const verdict = resolveNextInLineDuplicateCheck(key, response);
      expect(verdict.status).toBe("unavailable");
      expect(nextInLineReviewReadiness(current, verdict).ready).toBe(false);
    }
    expect(nextInLineReviewReadiness(current, { key, status: "checking" }).ready).toBe(false);
  });

  it("maps authoritative duplicate classifications to specific review blockers", () => {
    const current = draft();
    const key = nextInLineDuplicateKey(current);
    const song = resolveNextInLineDuplicateCheck(key, {
      ok: true, duplicate: true, type: "song",
    });
    const artist = resolveNextInLineDuplicateCheck(key, {
      ok: true, duplicate: true, type: "artist",
    });
    expect(nextInLineReviewReadiness(current, song)).toMatchObject({
      ready: false, reason: expect.stringContaining("song"),
    });
    expect(nextInLineReviewReadiness(current, artist)).toMatchObject({
      ready: false, reason: expect.stringContaining("artist"),
    });
  });

  it("fails closed on missing country identity and incomplete inputs", () => {
    for (const change of [
      { sourceSubmissionId: "" },
      { country: "" },
      { method: "unknown" as const },
      { previewStart: "01:99" },
      { artist: "" },
      { songTitle: "" },
      { songUrl: "" },
      { songUrl: "javascript:invalid" },
    ]) {
      const current = draft(change);
      expect(nextInLineReviewReadiness(current, clearFor(current)).ready).toBe(false);
    }
  });

  it("accepts only server-provided non-winning NF candidate IDs", () => {
    const current = draft({
      method: "national_final",
      eligibleNationalFinalEntryIds: ["nf-runner-up"],
      nationalFinalEntryId: "nf-runner-up",
      artist: "",
      songTitle: "",
      songUrl: "",
    });
    expect(nextInLineReviewReadiness(current, null)).toEqual({ ready: true });
    expect(nextInLineReviewReadiness({
      ...current,
      nationalFinalEntryId: "nf-winner-not-listed",
    }, null).ready).toBe(false);
  });

  it("invalidates review snapshots when song, country, NF pick or preview changes", () => {
    const current = draft();
    for (const changes of [
      { songTitle: "Edited" },
      { country: "Different country" },
      { sourceSubmissionId: "different" },
      { previewStart: "01:21" },
      { nationalFinalEntryId: "different" },
    ]) {
      expect(nextInLineDraftFingerprint(current)).not.toBe(
        nextInLineDraftFingerprint(draft(changes)),
      );
    }
  });

  it("does not treat clear check for another country or edition as valid", () => {
    const current = draft();
    expect(nextInLineReviewReadiness(draft({ country: "Vendia" }), clearFor(current)).ready).toBe(false);
    expect(nextInLineReviewReadiness(draft({ editionId: "edition-23" }), clearFor(current)).ready).toBe(false);
  });

  it("accepts only a persisted UUID with matching server edition and source context", () => {
    const editionId = "00000000-0000-4000-8000-000000000001";
    const sourceSubmissionId = "00000000-0000-4000-8000-000000000002";
    const submissionId = "00000000-0000-4000-8000-000000000003";
    const server = {
      ok: true,
      submission_id: submissionId,
      edition_id: editionId,
      source_submission_id: sourceSubmissionId,
    };
    const expected = { editionId, sourceSubmissionId };
    expect(authoritativeNextInLineSubmissionId(server, expected)).toBe(submissionId);
    expect(authoritativeNextInLineSubmissionId({ ...server, edition_id: "other" }, expected)).toBeNull();
    expect(authoritativeNextInLineSubmissionId({ ...server, source_submission_id: "other" }, expected)).toBeNull();
    expect(authoritativeNextInLineSubmissionId({ ...server, submission_id: "not-a-uuid" }, expected)).toBeNull();
    expect(authoritativeNextInLineSubmissionId({ ...server, ok: false }, expected)).toBeNull();
    expect(authoritativeNextInLineSubmissionId({ ok: true }, expected)).toBeNull();
  });

});
