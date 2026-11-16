import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/components/studio/EditionArtworkControl.tsx", "utf8");
const command = readFileSync("src/lib/edition-public-visual-command.ts", "utf8");
const sql = readFileSync(".github/tests/v3-edition-public-visual-authority.sql", "utf8");

describe("S16 P03: colour-only edition writes use reviewed visual command", () => {
  const palette = component.slice(
    component.indexOf('      } else {\n        // P03/P01: colour-only'),
    component.indexOf("        setThemeDraft(review.theme);", component.indexOf('      } else {\n        // P03/P01: colour-only')),
  );

  it("routes palette-only changes through the canonical receipted RPC, never table DML", () => {
    expect(palette).toContain("await applyEditionPublicVisualChange({");
    for (const token of [
      "expectedRevision: review.baseline.editionRevision",
      "expectedName: review.baseline.editionSourceName",
      "expectedSlug: review.baseline.editionSlug",
      "expectedThemeColors: review.baseline.themeColorsSnapshot",
      "generatedFromArtwork: false",
    ]) expect(palette).toContain(token);
    expect(palette).not.toContain("saveEditionVisualTheme(");
    expect(palette).not.toContain('.from("editions")');
    expect(palette).not.toContain("artworkUrl");
    expect(palette).not.toContain("artworkStoragePath");
  });

  it("freezes source name/slug/revision/colours and rechecks live state before mutation", () => {
    for (const token of [
      "editionSourceName: activeEdition.name",
      "editionSlug: activeEdition.slug",
      "editionRevision: Number(activeEdition.data_revision)",
      "themeColorsSnapshot:",
      "liveEdition.data_revision !== baseline.editionRevision",
      "liveEdition.name !== baseline.editionSourceName",
      "liveEdition.slug !== baseline.editionSlug",
      "await verifyBaseline(review.baseline)",
    ]) expect(component).toContain(token);
    expect(component.indexOf("await verifyBaseline(review.baseline)"))
      .toBeLessThan(component.indexOf("await applyEditionPublicVisualChange({"));
  });

  it("preserves separate artwork handling, without representing it as certified", () => {
    expect(component).toContain('if (review.kind === "upload")');
    expect(component).toContain("await uploadEditionArtwork(");
    expect(component).toContain("await saveEditionVisualTheme({");
    expect(component).toContain("persistence currently spans multiple legacy operations and is not atomic");
    expect(command).toContain('rpc("v3_apply_edition_visual_change", args)');
    expect(command).toContain("expectedThemeColors: Record<string, unknown> | null");
  });

  it("uses the existing executable PG17 positive, denial, replay and Storage boundary suite", () => {
    expect(sql).toContain("v3_apply_edition_visual_change(");
    expect(sql).toContain("Exact visual retry failed to replay original receipt");
    expect(sql).toContain("Cross-edition visual mutation succeeded");
    expect(sql).toContain("Revoked actor replayed an official visual command");
    expect(sql).toContain("Visual authority permitted arbitrary artwork/logo bytes");
  });
});
