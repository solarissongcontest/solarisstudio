import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/design.$slug.tsx",
  "utf8",
);

describe("V3 Organizer Design & Broadcast review boundary", () => {
  it("routes save and reset controls through explicit Organizer review", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("onClick={openSaveReview}");
    expect(route).toContain("onClick={openResetReview}");
    expect(route).toContain("onConfirm={applyReviewedDesign}");
    expect(route).not.toContain('onClick={() => void (scope === "edition" ? saveEditionDefault() : saveRoundOverride())}');
    expect(route).not.toContain("onClick={() => void resetRound()}");
  });

  it("freezes exact reviewed Production inputs instead of reading mutable drafts at confirmation time", () => {
    expect(route).toContain("themeConfig: cloneForReview(themeDraft)");
    expect(route).toContain("broadcastConfig: cloneForReview(broadcastDraft)");
    expect(route).toContain("scoreboardConfig: cloneForReview(normalizeScoreboard(scoreboardDraft");
    expect(route).toContain("participantCount: participantCountByShow.get(show.id) ?? 0");
    expect(route).toContain("confirmationText={pendingReview ? reviewTarget : undefined}");
  });

  it("binds reset-to-default review to the exact inherited theme and broadcast source", () => {
    expect(route).toContain('setError("The inherited edition theme could not be resolved. Reload before reviewing this reset.")');
    expect(route).toContain("themeTarget: { id: editionThemeRow.id, configFingerprint: stableFingerprint(editionThemeRow.config) }");
    expect(route).toContain("defaultBroadcastSourceShow.id !== selectedShow.id");
    expect(route).toContain("sourceShows: inheritedBroadcastSources");
    expect(route).toContain("const reviewedShows = [...review.shows, ...review.sourceShows]");
    expect(route).toContain("const reviewedShowIds = [...new Set(reviewedShows.map((show) => show.id))]");
  });

  it("re-reads exact edition theme show state and affected participant counts before apply", () => {
    expect(route).toContain('.from("editions")');
    expect(route).toContain('.select("id, theme_id")');
    expect(route).toContain('.from("themes")');
    expect(route).toContain('.select("id, config")');
    expect(route).toContain('.from("shows")');
    expect(route).toContain('.select("id, name, edition_id, theme_id, broadcast_config")');
    expect(route).toContain("stableFingerprint(liveShow.broadcast_config ?? null)");
    expect(route).toContain("const affectedShowIds = review.shows.map((show) => show.id)");
    expect(route).toContain('.from("participants")');
    expect(route).toContain('.select("show_id")');
    expect(route).toContain("The participant count for ${reviewedShow.name} changed while this review was open.");
  });

  it("keeps legacy writes exact-edition scoped and does not claim atomic authority", () => {
    expect(route).toContain('.eq("id", show.id).eq("edition_id", review.editionId)');
    // Preserve exact show scope and partial-commit disclosure. Edition theme
    // attachment now has a CAS/receipt boundary; the whole design save does not.
    expect(route).toContain("await applyEditionThemeChange({");
    expect(route).toContain("expectedThemeId: review.editionThemeId");
    expect(route).toContain("Edition theme attachment is receipted");
    expect(route).toContain("still spans legacy show writes");
    expect(route).toContain("Refresh canonical state before retrying because partial show progress may exist");
  });

  it("discards reviewed commands when Organizer scope changes", () => {
    expect(route).toContain("setPendingReview(null)");
    expect(route).toContain("[organizerEditionId, edition?.id, scope, selectedShow?.id]");
  });
});
