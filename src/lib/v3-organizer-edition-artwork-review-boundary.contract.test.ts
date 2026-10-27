import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/components/studio/EditionArtworkControl.tsx",
  "utf8",
);

describe("V3 Organizer edition artwork review boundary", () => {
  it("keeps file selection and palette editing outside mutation authority until review", () => {
    expect(source).toContain("AdminConfirmSheet");
    expect(source).toContain("prepareArtworkReview(file)");
    expect(source).toContain("onClick={preparePaletteReview}");
    expect(source).toContain("onConfirm={applyReviewedChange}");
    expect(source).not.toContain("if (file) void upload(file)");
    expect(source).not.toContain("onClick={() => void savePalette()}");
  });

  it("freezes the exact file palette edition shows and linked theme configs", () => {
    expect(source).toContain("file: File");
    expect(source).toContain("theme: cloneForReview(extracted.theme)");
    expect(source).toContain("palette: [...extracted.palette]");
    expect(source).toContain("config: cloneForReview(row.config)");
    expect(source).toContain("shows: showSnapshots");
    expect(source).toContain("confirmationText={pendingReview?.baseline.editionName}");
  });

  it("fails closed on edition show binding or theme drift before upload or save", () => {
    expect(source).toContain('.select("id,theme_id,logo,artwork_url,artwork_storage_path,theme_colors")');
    expect(source).toContain("Edition artwork or colour state changed while this review was open.");
    expect(source).toContain('.select("id,theme_id")');
    expect(source).toContain("Show-to-theme assignments changed while this review was open.");
    expect(source).toContain('.select("id,config")');
    expect(source).toContain("A linked scoreboard theme changed while this review was open.");
    expect(source.indexOf("await verifyBaseline(review.baseline)")).toBeLessThan(
      source.indexOf("await uploadEditionArtwork(review.baseline.editionId, review.file)"),
    );
  });

  it("syncs only the exact reviewed theme set and states the remaining System boundary", () => {
    expect(source).toContain("synchroniseReviewedScoreboardThemes(review.theme, review.baseline.themes)");
    expect(source).toContain("reviewedTheme.config");
    expect(source).toContain("Uploads and linked scoreboard theme updates can finish separately");
    expect(source).toContain("expected: {");
    expect(source).toContain("logoUrl: asset.publicUrl");
    expect(source).toContain("verified upload or theme changes may already have succeeded");
  });
});
