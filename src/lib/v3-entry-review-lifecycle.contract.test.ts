import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveV3EntryLifecycle, type V3EntryConfirmationProjection } from "./v3-entry";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function confirmationWithVersionReview(input: {
  currentVersionId: string;
  reviewedVersionId: string;
}): V3EntryConfirmationProjection {
  return {
    submissionId: "submission-1",
    roundId: "round-1",
    roundName: "Confirmation",
    submittedAt: "2026-10-16T18:00:00.000Z",
    updatedAt: "2026-10-17T08:00:00.000Z",
    selectionMethod: "internal",
    canEdit: true,
    editReason: null,
    receipt: null,
    internalEntry: {
      id: "entry-1",
      artist: "Artist",
      songTitle: "Song",
      credits: [{ role: "composer", name: "Updated Composer" }],
      reviewStatus: "accepted",
      reviewReason: null,
      contentRevision: 2,
      currentVersionId: input.currentVersionId,
      reviewedVersionId: input.reviewedVersionId,
      reviewMatchesCurrentVersion: input.currentVersionId === input.reviewedVersionId,
      removed: false,
    },
    nationalFinal: null,
  };
}

describe("P13 Entry review and correction lifecycle", () => {
  it("keeps lifecycle status inside the V3 participant Entry route", () => {
    const gate = read("src/components/v3/V3EntryRouteGate.tsx");
    const panel = read("src/components/v3/V3EntryLifecyclePanel.tsx");

    expect(gate).toContain("V3EntryLifecyclePanel");
    expect(gate).toContain("projection={bundle.data.projection}");
    expect(panel).toContain("data-v3-entry-lifecycle");
    expect(panel).toContain("data-v3-entry-correction-reason");
    expect(panel).toContain("Organizer reason");
    expect(panel).toContain("Suggested editor section");
    expect(panel).toContain("Current version accepted");
    expect(panel).toContain("Current version needs review");
  });

  it("derives status only from canonical submission and immutable review-version evidence", () => {
    const lifecycle = read("src/lib/v3-entry.ts");

    expect(lifecycle).toContain("deriveV3EntryLifecycle");
    expect(lifecycle).toContain('reviewStatus === "declined" && candidate.reviewMatchesCurrentVersion');
    expect(lifecycle).toContain('reviewStatus === "accepted" && candidate.reviewMatchesCurrentVersion');
    expect(lifecycle).toContain("reviewedVersionId === input.currentVersionId");
    expect(lifecycle).not.toContain("Date.now(");
    expect(lifecycle).not.toContain("localStorage");
    expect(lifecycle).not.toContain("sessionStorage");
  });

  it("marks the old organizer review stale when a Credits edit creates a new Entry version", () => {
    const lifecycle = deriveV3EntryLifecycle(
      confirmationWithVersionReview({
        currentVersionId: "entry-version-2-credits-update",
        reviewedVersionId: "entry-version-1-organizer-accepted",
      }),
    );

    expect(lifecycle).toEqual({
      state: "review-stale",
      issue: null,
      affectedCandidateIds: ["entry-1"],
    });
  });

  it("keeps an organizer acceptance authoritative only while it matches the current Entry version", () => {
    const lifecycle = deriveV3EntryLifecycle(
      confirmationWithVersionReview({
        currentVersionId: "entry-version-2-credits-update",
        reviewedVersionId: "entry-version-2-credits-update",
      }),
    );

    expect(lifecycle.state).toBe("accepted");
  });

  it("shows resubmission differences only from immutable server version history, including structured Credits", () => {
    const gate = read("src/components/v3/V3EntryRouteGate.tsx");
    const panel = read("src/components/v3/V3EntryResubmissionPanel.tsx");
    const projection = read("src/lib/v3-entry.ts");
    const source = read("src/integrations/v3/entry-source.server.ts");

    expect(gate).toContain("V3EntryResubmissionPanel");
    expect(panel).toContain('data-v3-entry-resubmission-diff="server-version-history"');
    expect(panel).toContain("deriveV3EntryResubmissionDiff(projection.versionHistory)");
    expect(panel).toContain("immutable server Entry versions for Artist, Song and Credits");
    expect(projection).toContain("deriveV3EntryResubmissionDiff");
    expect(projection).toContain('field: "artist"');
    expect(projection).toContain('field: "songTitle"');
    expect(projection).toContain('field: "credits"');
    expect(source).toContain("credits: mapCredits(content.credits)");
    expect(source).toContain('targetType: "national_final"');
    expect(panel).not.toContain("localStorage");
    expect(panel).not.toContain("sessionStorage");
    expect(panel).not.toContain("supabase");
  });

  it("preserves the canonical Confirmation writer and server-selected edit authority", () => {
    const screen = read("src/components/v3/V3EntryScreen.tsx");
    const action = read("src/lib/v3-entry.actions.ts");
    const server = read("src/integrations/v3/entry-actions.server.ts");

    expect(screen).toContain("openCurrentV3EntryEditor");
    expect(action).toContain("noSelectorInput");
    expect(action).toContain("createCurrentV3EntryEditLink");
    expect(server).toContain('client.rpc("public_create_country_account_edit_token"');
    expect(server).toContain("No browser-provided user, country, edition, round or");
    expect(server).not.toContain("supabaseAdmin");
  });
});