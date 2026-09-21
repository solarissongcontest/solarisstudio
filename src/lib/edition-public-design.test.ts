import { describe, expect, it } from "vitest";

import {
  EDITION_DESIGN_FIXTURES,
  EDITION_PUBLIC_STYLE_IDS,
  EDITION_PUBLIC_STYLES,
  meaningfulEditionSubtitle,
  resolveEditionPublicSettings,
} from "./edition-public-design";

const theme = { accent: "#86c9d7", backgroundPrimary: "#071a2b", backgroundSecondary: "#123a49" };

describe("edition public design system", () => {
  it("preserves every persisted style identifier exactly once", () => {
    expect(EDITION_PUBLIC_STYLE_IDS).toEqual(["cinematic", "editorial", "minimal", "glass"]);
    expect(EDITION_PUBLIC_STYLES.map((item) => item.id)).toEqual(EDITION_PUBLIC_STYLE_IDS);
    expect(new Set(EDITION_PUBLIC_STYLES.map((item) => item.archetype)).size).toBe(4);
  });

  it("keeps existing settings and clamps unsafe values", () => {
    expect(resolveEditionPublicSettings({ publicStyle: "glass", publicRadius: 120, publicFocalX: -4, publicFocalY: 140 }, theme)).toMatchObject({
      style: "glass",
      radius: 40,
      focalX: 0,
      focalY: 100,
    });
    expect(resolveEditionPublicSettings({ publicStyle: "editorial", publicRadius: 24 }, theme).radius).toBe(0);
    expect(resolveEditionPublicSettings({ publicStyle: "retired" }, theme).style).toBe("cinematic");
  });

  it("ships the five required hostile fixtures", () => {
    expect(EDITION_DESIGN_FIXTURES.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(EDITION_DESIGN_FIXTURES.find((item) => item.id === "e")?.entries).toBe(66);
  });

  it("suppresses a generic expanded edition name while retaining a real subtitle", () => {
    expect(meaningfulEditionSubtitle("Solaris Song Contest 20", "SSC 20", 20)).toBeNull();
    expect(meaningfulEditionSubtitle("  SSC-20  ", "SSC 20", 20)).toBeNull();
    expect(meaningfulEditionSubtitle("Fragments of Unity", "SSC 20", 20)).toBe("Fragments of Unity");
  });
});
