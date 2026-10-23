import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ORGANIZER_JURY_SHARE_SAMPLE_ROWS,
  createOrganizerJuryShareComposition,
  validateOrganizerJuryShareComposition,
} from "./v3-organizer-jury-share-theme";

const route = readFileSync(
  "src/routes/_authenticated/admin/design.$slug.share-graphics.tsx",
  "utf8",
);
const editor = readFileSync(
  "src/components/admin/JuryShareEditionThemeEditor.tsx",
  "utf8",
);

describe("Organizer Jury Share Edition theme route", () => {
  it("fails closed on exact Organizer edition context instead of inventing scope", () => {
    expect(route).toContain('useAdminContext()');
    expect(route).toContain('edition.id === organizerEditionId');
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).not.toContain('editions[0]');
    expect(route).not.toContain('.sort((a, b) => b.edition_number');
  });

  it("keeps JSC-8 non-authoritative until JSC-7 lands", () => {
    expect(route).toContain("canonical save is intentionally gated");
    expect(route).toContain("System contract required");
    expect(route).toContain('state="unconfigured"');
    expect(route).not.toContain("supabase");
    expect(route).not.toContain("onSaveDraft=");
    expect(route).not.toContain("onRequestReady=");
    expect(route).not.toContain("onArchive=");
  });

  it("uses fixed sample vote rows and never requires hidden ballot data for preview", () => {
    expect(ORGANIZER_JURY_SHARE_SAMPLE_ROWS.map((row) => row.points)).toEqual([
      12, 10, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(editor).toContain("Preview uses fixed sample countries only");
    expect(editor).toContain("Hidden jury votes are never required for branding work");
    expect(editor).not.toContain('from("jury_votes")');
    expect(editor).not.toContain('from("jury_ballot_submissions")');
  });

  it("keeps the three canonical design choices and structured-only editor", () => {
    expect(editor).toContain('title="Default"');
    expect(editor).toContain('title="Edition"');
    expect(editor).toContain('title="Liquid Glass"');
    expect(editor).toContain("no Custom CSS, Custom HTML or Custom JavaScript escape hatch");
    expect(editor).toContain('aria-label={`Sample 9:16 Jury Share preview for ${editionLabel}`}');
  });

  it("validates bounded composition state before System Ready validation", () => {
    const draft = createOrganizerJuryShareComposition({ artworkAssetId: "edition/artwork.png" });
    expect(validateOrganizerJuryShareComposition(draft).valid).toBe(true);

    const invalid = {
      ...draft,
      artwork: draft.artwork
        ? { ...draft.artwork, focalX: 2, fadeStart: 0.8, fadeEnd: 0.2 }
        : null,
    };
    const validation = validateOrganizerJuryShareComposition(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toContain("ARTWORK_FOCAL_INVALID");
    expect(validation.errors.map((issue) => issue.code)).toContain("ARTWORK_FADE_ORDER_INVALID");
  });
});
