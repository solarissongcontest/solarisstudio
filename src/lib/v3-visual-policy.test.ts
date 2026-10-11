import { describe, expect, it } from "vitest";

import {
  projectV3ArtworkTreatment,
  resolveV3EffectProfile,
  validateV3VisualComposition,
  v3VisualBudget,
} from "./v3-visual-policy";

describe("V3 visual policy", () => {
  it("prefers opaque materials when reduced transparency is requested", () => {
    expect(resolveV3EffectProfile({ reduceTransparency: true })).toBe("opaque");
  });

  it("reduces expensive/expressive effects for reduced motion or low-power profiles", () => {
    expect(resolveV3EffectProfile({ reduceMotion: true })).toBe("reduced");
    expect(resolveV3EffectProfile({ lowPowerEffects: true })).toBe("reduced");
  });

  it("keeps normal users on full fidelity", () => {
    expect(resolveV3EffectProfile({})).toBe("full");
  });

  it("uses a strict effect budget on ordinary utility screens", () => {
    const budget = v3VisualBudget("utility", "full");
    expect(budget).toMatchObject({
      maxDominantArtwork: 0,
      maxGlassLayers: 1,
      maxPrimaryAccents: 1,
      allowAmbientGlow: false,
      allowParallax: false,
      allowExpressiveReveal: false,
    });
  });

  it("allows expressive event moments without allowing multiple competing accents/glass layers", () => {
    const budget = v3VisualBudget("event", "full");
    expect(budget.allowAmbientGlow).toBe(true);
    expect(budget.allowExpressiveReveal).toBe(true);
    expect(budget.maxGlassLayers).toBe(1);
    expect(budget.maxPrimaryAccents).toBe(1);
  });

  it("turns glass off entirely in opaque accessibility mode", () => {
    expect(v3VisualBudget("event", "opaque").maxGlassLayers).toBe(0);
  });

  it("projects stable responsive artwork focal positioning", () => {
    expect(
      projectV3ArtworkTreatment({
        focalX: 68,
        focalY: 32,
        safeTextRegion: "left",
        dominantColor: "#375BFF",
      }),
    ).toEqual({
      objectPosition: "68% 32%",
      safeTextRegion: "left",
      ambientColor: "#375BFF",
      scrimDirection: "left",
      scrimStrength: "medium",
    });
  });

  it("clamps broken artwork focal metadata rather than producing invalid CSS", () => {
    expect(projectV3ArtworkTreatment({ focalX: 150, focalY: -20 }).objectPosition).toBe(
      "100% 0%",
    );
  });

  it("uses a stronger uniform scrim when text must sit over the center of artwork", () => {
    expect(projectV3ArtworkTreatment({ safeTextRegion: "center" })).toMatchObject({
      scrimDirection: "uniform",
      scrimStrength: "strong",
    });
  });

  it("detects premium-effect pileups before they become a glowing swamp", () => {
    const violations = validateV3VisualComposition(
      {
        dominantArtworkCount: 2,
        glassLayerCount: 3,
        primaryAccentCount: 2,
        ambientGlowCount: 1,
        parallaxCount: 1,
        expressiveRevealCount: 1,
      },
      v3VisualBudget("standard", "full"),
    );

    expect(violations).toContain("too_many_dominant_artworks");
    expect(violations).toContain("too_many_glass_layers");
    expect(violations).toContain("too_many_primary_accents");
    expect(violations).toContain("ambient_glow_not_allowed");
    expect(violations).toContain("parallax_not_allowed");
    expect(violations).toContain("expressive_reveal_not_allowed");
  });

  it("accepts one disciplined event composition", () => {
    expect(
      validateV3VisualComposition(
        {
          dominantArtworkCount: 1,
          glassLayerCount: 1,
          primaryAccentCount: 1,
          ambientGlowCount: 1,
          parallaxCount: 0,
          expressiveRevealCount: 1,
        },
        v3VisualBudget("event", "full"),
      ),
    ).toEqual([]);
  });
});
