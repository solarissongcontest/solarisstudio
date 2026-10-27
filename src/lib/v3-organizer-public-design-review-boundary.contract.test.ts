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
    expect(panel).toContain('.select("id,slug,name,theme_colors")');
    expect(panel).toContain('.eq("id", pendingReview.editionId)');
    expect(panel).toContain("liveEdition.slug !== pendingReview.editionSlug");
    expect(panel).toContain("liveEdition.name !== pendingReview.editionName");
    expect(panel).toContain("!sameJson(liveThemeColors, pendingReview.beforeThemeColors)");
    expect(panel).toContain("The edition identity or public design changed while this review was open");
    expect(panel).toContain("Nothing was changed");
  });

  it("applies only the frozen reviewed theme payload to the exact reviewed edition", () => {
    expect(panel).toContain("theme_colors: pendingReview.nextThemeColors");
    expect(panel).toContain("slug: pendingReview.editionSlug");
    expect(panel).toContain('confirmationText={pendingReview?.editionName}');
    expect(panel).toContain("The reviewed payload also freezes surface strength, hero glow and both gradient configurations exactly as previewed");
  });

  it("uses the canonical visual command with exact reviewed identity and state", () => {
    expect(panel).toContain("await applyEditionVisualChange({");
    expect(panel).toContain("theme_colors: pendingReview.beforeCanonicalThemeColors");
    expect(panel).not.toContain('.update({ theme_colors:');
  });
});
