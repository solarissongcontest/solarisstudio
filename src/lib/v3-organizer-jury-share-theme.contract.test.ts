import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  JURY_SHARE_SAMPLE_VOTES,
  createDefaultJuryShareEditionTheme,
  nextJuryShareThemeVersion,
  validateJuryShareThemeForReady,
  validateJuryShareThemeStructure,
  type JuryShareValidationEvidence,
} from "./v3-jury-share-theme";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const completeEvidence: JuryShareValidationEvidence = {
  artworkResolves: true,
  logoResolves: true,
  fontsResolve: true,
  glyphCoverage: true,
  longNamesFit: true,
  allRowsFit: true,
  scoreDoesNotOverlap: true,
  footerInsideSafeArea: true,
  headerInsideSafeArea: true,
  rowsHaveSufficientContrast: true,
  countryNamesHaveSufficientContrast: true,
  scoresHaveSufficientContrast: true,
  headerHasSufficientContrast: true,
  footerHasSufficientContrast: true,
  pngExportSucceeds: true,
  jpegExportSucceeds: true,
};

describe("Organizer V3 jury share Edition theme", () => {
  it("uses safe sample data instead of hidden jury votes for Organizer preview", () => {
    expect(JURY_SHARE_SAMPLE_VOTES).toHaveLength(10);
    expect(JURY_SHARE_SAMPLE_VOTES.map((vote) => vote.points)).toEqual([12, 10, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(JURY_SHARE_SAMPLE_VOTES.every((vote) => vote.country.startsWith("Country "))).toBe(true);

    const editor = source("src/components/studio/JuryShareThemeEditor.tsx");
    expect(editor).toContain("JURY_SHARE_SAMPLE_VOTES");
    expect(editor).toContain("sample data only");
    expect(editor).toContain("Hidden or unpublished jury votes are never required");
    expect(editor).not.toContain("jury_votes");
    expect(editor).not.toContain("jury_ballots");
  });

  it("keeps the editor structured and refuses arbitrary CSS, HTML or JavaScript configuration", () => {
    const model = source("src/lib/v3-jury-share-theme.ts");
    const editor = source("src/components/studio/JuryShareThemeEditor.tsx");

    expect(model).toContain("JuryShareArtworkTheme");
    expect(model).toContain("JuryShareScoreboardTheme");
    expect(model).toContain("JuryShareHeaderTheme");
    expect(model).toContain("JuryShareFooterTheme");
    expect(model).not.toMatch(/customCss|customHtml|customJavaScript|customJS/);
    expect(editor).not.toMatch(/Custom CSS|Custom HTML|Custom JavaScript/);
  });

  it("keeps Default and Liquid Glass read-only while Edition is the editable Organizer design", () => {
    const editor = source("src/components/studio/JuryShareThemeEditor.tsx");
    expect(editor).toContain("Default Solaris design. Always available and not Organizer-editable.");
    expect(editor).toContain("Editable edition-specific artwork, scoreboard, header and footer treatment.");
    expect(editor).toContain("Solaris-level alternative. Available independently from this Edition configuration.");
  });

  it("does not introduce browser-owned persistence or production data authority", () => {
    const editor = source("src/components/studio/JuryShareThemeEditor.tsx");
    expect(editor).not.toContain("supabase");
    expect(editor).not.toContain(".from(");
    expect(editor).not.toContain(".rpc(");
    expect(editor).not.toContain("fetch(");
    expect(editor).toContain("System-owned exact-edition share-theme command contract");
  });

  it("fails structural validation for impossible artwork and safe-area state", () => {
    const theme = createDefaultJuryShareEditionTheme("edition-22");
    theme.artwork.enabled = true;
    theme.artwork.assetId = null;
    theme.artwork.fadeStart = 0.9;
    theme.artwork.fadeEnd = 0.2;
    theme.safeArea.left = 600;
    theme.safeArea.right = 600;

    const validation = validateJuryShareThemeStructure(theme);
    expect(validation.status).toBe("invalid");
    expect(validation.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining(["ARTWORK_REQUIRED", "ARTWORK_FADE_ORDER", "SAFE_AREA_WIDTH_INVALID"]),
    );
  });

  it("requires complete validation evidence before Ready", () => {
    const theme = createDefaultJuryShareEditionTheme("edition-22", "artwork-22");
    expect(validateJuryShareThemeForReady(theme, {}).status).toBe("invalid");
    expect(validateJuryShareThemeForReady(theme, completeEvidence)).toEqual(
      expect.objectContaining({ status: "valid", errors: [] }),
    );
  });

  it("does not require unused artwork or logo evidence", () => {
    const theme = createDefaultJuryShareEditionTheme("edition-22");
    theme.artwork.enabled = false;
    theme.header.useEditionLogo = false;

    const remainingEvidence: Partial<JuryShareValidationEvidence> = { ...completeEvidence };
    delete remainingEvidence.artworkResolves;
    delete remainingEvidence.logoResolves;
    const validation = validateJuryShareThemeForReady(theme, remainingEvidence);
    expect(validation.status).toBe("valid");
  });

  it("creates a new draft version instead of mutating a Ready historical configuration", () => {
    const ready = createDefaultJuryShareEditionTheme("edition-22", "artwork-22");
    ready.version = 4;
    ready.state = "ready";

    const next = nextJuryShareThemeVersion(ready);
    expect(next.version).toBe(5);
    expect(next.state).toBe("draft");
    expect(ready.version).toBe(4);
    expect(ready.state).toBe("ready");
  });

  it("covers the canonical Organizer editor controls and readiness categories", () => {
    const editor = source("src/components/studio/JuryShareThemeEditor.tsx");
    const model = source("src/lib/v3-jury-share-theme.ts");

    for (const control of [
      "Artwork asset",
      "Placement",
      "Scale",
      "Focal X",
      "Focal Y",
      "Opacity",
      "Blur",
      "Fade direction",
      "Fade start",
      "Fade end",
      "Scrim",
      "Inherit Edition scoreboard tokens",
      "12-point treatment",
      "Flag frame",
      "Score typography",
      "Header alignment",
      "Title treatment",
      "Source-country treatment",
      "Footer background",
      "Edition motif",
    ]) {
      expect(editor).toContain(control);
    }

    for (const evidence of [
      "artworkResolves",
      "logoResolves",
      "fontsResolve",
      "glyphCoverage",
      "longNamesFit",
      "allRowsFit",
      "scoreDoesNotOverlap",
      "footerInsideSafeArea",
      "headerInsideSafeArea",
      "rowsHaveSufficientContrast",
      "countryNamesHaveSufficientContrast",
      "scoresHaveSufficientContrast",
      "headerHasSufficientContrast",
      "footerHasSufficientContrast",
      "pngExportSucceeds",
      "jpegExportSucceeds",
    ]) {
      expect(model).toContain(evidence);
    }
  });
});
