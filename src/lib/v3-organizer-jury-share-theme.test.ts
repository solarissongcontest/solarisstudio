import { describe, expect, it } from "vitest";

import { JURY_SHARE_POINTS, JURY_SHARE_TARGETS } from "./v3-jury-share-card-foundation";
import {
  ORGANIZER_JURY_SHARE_MANAGE_CAPABILITY,
  ORGANIZER_JURY_SHARE_SAMPLE_ROWS,
  ORGANIZER_JURY_SHARE_VIEW_CAPABILITY,
  createOrganizerJuryShareComposition,
  organizerJuryShareStateLabel,
  validateOrganizerJuryShareComposition,
} from "./v3-organizer-jury-share-theme";

describe("Organizer Jury Share Edition theme model", () => {
  it("uses dedicated view/manage capabilities instead of Result publication authority", () => {
    expect(ORGANIZER_JURY_SHARE_VIEW_CAPABILITY).toBe("edition.share_theme.view");
    expect(ORGANIZER_JURY_SHARE_MANAGE_CAPABILITY).toBe("edition.share_theme.manage");
  });

  it("starts from the canonical Story safe area and a bounded structured recipe", () => {
    const composition = createOrganizerJuryShareComposition({
      artworkAssetId: "edition-artwork/ssc22.webp",
    });

    expect(composition.safeArea).toEqual(JURY_SHARE_TARGETS.story.safeArea);
    expect(composition.artwork).toMatchObject({
      assetId: "edition-artwork/ssc22.webp",
      placement: "top_fade",
      scale: "cover",
      fadeDirection: "down",
    });
    expect(composition.scoreboard.inheritEditionScoreboard).toBe(true);
    expect(Object.keys(composition).sort()).toEqual(
      ["artwork", "background", "decorativeAssets", "footer", "header", "safeArea", "scoreboard"].sort(),
    );
  });

  it("uses fixed non-sensitive sample rows with the canonical jury point set", () => {
    expect(ORGANIZER_JURY_SHARE_SAMPLE_ROWS.map((row) => row.points)).toEqual(JURY_SHARE_POINTS);
    expect(ORGANIZER_JURY_SHARE_SAMPLE_ROWS.map((row) => row.country)).toEqual([
      "Country A",
      "Country B",
      "Country C",
      "Country D",
      "Country E",
      "Country F",
      "Country G",
      "Country H",
      "Country I",
      "Country J",
    ]);
  });

  it("allows a no-artwork draft with a warning instead of inventing an asset", () => {
    const composition = createOrganizerJuryShareComposition();
    const validation = validateOrganizerJuryShareComposition(composition);

    expect(composition.artwork).toBeNull();
    expect(validation.valid).toBe(true);
    expect(validation.warnings.map((warning) => warning.code)).toContain("EDITION_ARTWORK_NOT_CONFIGURED");
  });

  it("rejects invalid focal, fade, row and Story safe-area geometry", () => {
    const composition = createOrganizerJuryShareComposition({ artworkAssetId: "edition-artwork/ssc22.webp" });
    if (!composition.artwork) throw new Error("expected artwork");

    const validation = validateOrganizerJuryShareComposition({
      ...composition,
      artwork: {
        ...composition.artwork,
        focalX: 1.2,
        fadeStart: 0.8,
        fadeEnd: 0.3,
      },
      scoreboard: {
        ...composition.scoreboard,
        rowHeight: 20,
      },
      safeArea: {
        ...composition.safeArea,
        top: 1200,
        bottom: 900,
      },
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "ARTWORK_FOCAL_INVALID",
        "ARTWORK_FADE_ORDER_INVALID",
        "ROW_HEIGHT_INVALID",
        "SAFE_AREA_VERTICAL_INVALID",
      ]),
    );
  });

  it("warns when edition scoreboard inheritance is deliberately overridden", () => {
    const composition = createOrganizerJuryShareComposition();
    const validation = validateOrganizerJuryShareComposition({
      ...composition,
      scoreboard: { ...composition.scoreboard, inheritEditionScoreboard: false },
    });

    expect(validation.valid).toBe(true);
    expect(validation.warnings.map((warning) => warning.code)).toContain("SCOREBOARD_OVERRIDE_ACTIVE");
  });

  it("provides stable human state labels", () => {
    expect(organizerJuryShareStateLabel("unconfigured")).toBe("Not configured");
    expect(organizerJuryShareStateLabel("draft")).toBe("Draft");
    expect(organizerJuryShareStateLabel("ready")).toBe("Ready");
    expect(organizerJuryShareStateLabel("archived")).toBe("Archived");
    expect(organizerJuryShareStateLabel("invalid")).toBe("Needs fixes");
  });
});
