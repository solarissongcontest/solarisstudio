import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(
  resolve(process.cwd(), "src/components/EditionPublicDesignPanel.tsx"),
  "utf8",
);

describe("V3 Organizer public design review boundary", () => {
  it("freezes public design state into an explicit review instead of saving from the editor button", () => {
    expect(panel).toContain("type PendingPublicDesignReview");
    expect(panel).toContain("const requestSave = () =>");
    expect(panel).toContain("beforeThemeColors: cloneRecord(raw)");
    expect(panel).toContain("nextThemeColors: cloneRecord(next)");
    expect(panel).toContain('onClick={requestSave}');
    expect(panel).toContain("Review public page design");
    expect(panel).toContain("<AdminConfirmSheet");
    expect(panel).not.toContain('onClick={() => void save()}');
  });

  it("re-reads exact edition identity and complete theme state before apply", () => {
    expect(panel).toContain('.select("id,slug,name,theme_colors,data_revision")');
    expect(panel).toContain("liveEdition.data_revision !== pendingReview.beforeRevision");
    expect(panel).toContain('.eq("id", pendingReview.editionId)');
    expect(panel).toContain("liveEdition.slug !== pendingReview.editionSlug");
    expect(panel).toContain("liveEdition.name !== pendingReview.editionName");
    expect(panel).toContain("!sameJson(liveThemeColors, pendingReview.beforeThemeColors)");
    expect(panel).toContain("The edition identity or public design changed while this review was open");
    expect(panel).toContain("Nothing was changed");
  });

  it("applies only the frozen reviewed theme payload to the exact reviewed edition", () => {
    expect(panel).toContain("await applyEditionPublicVisualChange({");
    expect(panel).toContain("editionId: pendingReview.editionId");
    expect(panel).toContain("expectedRevision: pendingReview.beforeRevision");
    expect(panel).toContain("expectedName: pendingReview.editionName");
    expect(panel).toContain("expectedSlug: pendingReview.editionSlug");
    expect(panel).toContain("expectedThemeColors: pendingReview.beforeThemeColors");
    expect(panel).toContain("nextThemeColors: pendingReview.nextThemeColors");
    expect(panel).not.toContain('.update({ theme_colors: pendingReview.nextThemeColors })');
    expect(panel).toContain('confirmationText={pendingReview?.editionName}');
    expect(panel).toContain("The reviewed payload also freezes surface strength, hero glow and both gradient configurations exactly as previewed");
  });

  it("describes actual governed design authority while preserving separate artwork limitations", () => {
    expect(panel).toContain("server-governed edition command");
    expect(panel).toContain("idempotent replay and a durable receipt");
    expect(panel).toContain("Other artwork and Production design operations still require separate System authority cutover");
    expect(panel).not.toContain("underlying edition metadata update remains legacy direct-table authority");
  });
});
