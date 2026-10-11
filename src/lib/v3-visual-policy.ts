export type V3PresentationClass = "utility" | "standard" | "editorial" | "event";
export type V3EffectProfile = "full" | "reduced" | "opaque";

export type V3VisualPreferences = {
  reduceMotion?: boolean;
  reduceTransparency?: boolean;
  lowPowerEffects?: boolean;
};

export type V3ArtworkMetadata = {
  focalX?: number | null;
  focalY?: number | null;
  safeTextRegion?: "left" | "right" | "top" | "bottom" | "center" | null;
  dominantColor?: string | null;
};

export type V3ArtworkTreatment = {
  objectPosition: string;
  safeTextRegion: NonNullable<V3ArtworkMetadata["safeTextRegion"]>;
  ambientColor: string | null;
  scrimDirection: "left" | "right" | "top" | "bottom" | "uniform";
  scrimStrength: "light" | "medium" | "strong";
};

export type V3VisualBudget = {
  maxDominantArtwork: number;
  maxGlassLayers: number;
  maxPrimaryAccents: number;
  allowAmbientGlow: boolean;
  allowParallax: boolean;
  allowExpressiveReveal: boolean;
};

function clampPercent(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Number(value)));
}

export function resolveV3EffectProfile(preferences: V3VisualPreferences): V3EffectProfile {
  if (preferences.reduceTransparency) return "opaque";
  if (preferences.lowPowerEffects || preferences.reduceMotion) return "reduced";
  return "full";
}

export function v3VisualBudget(
  presentation: V3PresentationClass,
  profile: V3EffectProfile,
): V3VisualBudget {
  const event = presentation === "event";
  const expressive = presentation === "event" || presentation === "editorial";

  return {
    maxDominantArtwork: presentation === "utility" ? 0 : 1,
    maxGlassLayers: profile === "opaque" ? 0 : 1,
    maxPrimaryAccents: 1,
    allowAmbientGlow: profile === "full" && expressive,
    allowParallax: profile === "full" && presentation === "editorial",
    allowExpressiveReveal: profile !== "opaque" && event,
  };
}

export function projectV3ArtworkTreatment(
  metadata: V3ArtworkMetadata = {},
): V3ArtworkTreatment {
  const focalX = clampPercent(metadata.focalX, 50);
  const focalY = clampPercent(metadata.focalY, 50);
  const safeTextRegion = metadata.safeTextRegion ?? "left";

  const scrimDirection = (() => {
    switch (safeTextRegion) {
      case "left":
        return "left" as const;
      case "right":
        return "right" as const;
      case "top":
        return "top" as const;
      case "bottom":
        return "bottom" as const;
      case "center":
        return "uniform" as const;
    }
  })();

  const scrimStrength = safeTextRegion === "center" ? "strong" : "medium";

  return {
    objectPosition: `${focalX}% ${focalY}%`,
    safeTextRegion,
    ambientColor: metadata.dominantColor?.trim() || null,
    scrimDirection,
    scrimStrength,
  };
}

export type V3VisualComposition = {
  dominantArtworkCount: number;
  glassLayerCount: number;
  primaryAccentCount: number;
  ambientGlowCount: number;
  parallaxCount: number;
  expressiveRevealCount: number;
};

export type V3VisualBudgetViolation =
  | "too_many_dominant_artworks"
  | "too_many_glass_layers"
  | "too_many_primary_accents"
  | "ambient_glow_not_allowed"
  | "parallax_not_allowed"
  | "expressive_reveal_not_allowed";

/**
 * Design-system guardrail for the V3 "beauty has a budget" rule. This is not a
 * runtime rendering engine; it gives visual regression/design review tooling a
 * deterministic way to reject compositions that pile every premium effect into
 * the same viewport.
 */
export function validateV3VisualComposition(
  composition: V3VisualComposition,
  budget: V3VisualBudget,
): V3VisualBudgetViolation[] {
  const violations: V3VisualBudgetViolation[] = [];

  if (composition.dominantArtworkCount > budget.maxDominantArtwork) {
    violations.push("too_many_dominant_artworks");
  }
  if (composition.glassLayerCount > budget.maxGlassLayers) {
    violations.push("too_many_glass_layers");
  }
  if (composition.primaryAccentCount > budget.maxPrimaryAccents) {
    violations.push("too_many_primary_accents");
  }
  if (!budget.allowAmbientGlow && composition.ambientGlowCount > 0) {
    violations.push("ambient_glow_not_allowed");
  }
  if (!budget.allowParallax && composition.parallaxCount > 0) {
    violations.push("parallax_not_allowed");
  }
  if (!budget.allowExpressiveReveal && composition.expressiveRevealCount > 0) {
    violations.push("expressive_reveal_not_allowed");
  }

  return violations;
}
