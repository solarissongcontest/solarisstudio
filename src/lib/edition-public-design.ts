export const EDITION_PUBLIC_STYLE_IDS = ["cinematic", "editorial", "minimal", "glass"] as const;

export type EditionPublicStyle = (typeof EDITION_PUBLIC_STYLE_IDS)[number];

export type EditionPublicStyleDefinition = {
  id: EditionPublicStyle;
  label: string;
  archetype: "cinematic" | "split" | "typographic" | "compact";
  description: string;
  signature: string;
};

export const EDITION_PUBLIC_STYLES: readonly EditionPublicStyleDefinition[] = [
  {
    id: "cinematic",
    label: "Cinematic",
    archetype: "cinematic",
    description: "Artwork-led event identity with a deep stage and restrained glow.",
    signature: "Immersive artwork stage",
  },
  {
    id: "editorial",
    label: "Editorial",
    archetype: "split",
    description: "A sharp, asymmetric magazine composition with strong rules and rhythm.",
    signature: "Split-cover composition",
  },
  {
    id: "minimal",
    label: "Minimal",
    archetype: "typographic",
    description: "Typography, whitespace and a disciplined single accent do the work.",
    signature: "Typographic programme",
  },
  {
    id: "glass",
    label: "Liquid Glass",
    archetype: "compact",
    description: "A refractive event canvas with a generated lens-map hero and floating navigation.",
    signature: "Measured Liquid Glass refraction",
  },
] as const;

export type EditionPublicSettings = {
  style: EditionPublicStyle;
  radius: number;
  surfaceStrength: number;
  heroGlow: number;
  focalX: number;
  focalY: number;
  accentGradient: string | null;
  surfaceGradient: string | null;
};

export type EditionDesignTheme = {
  accent: string;
  backgroundPrimary: string;
  backgroundSecondary: string;
};

function clamp(input: unknown, min: number, max: number, fallback: number) {
  const number = Number(input);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function resolveEditionPublicStyle(raw: unknown): EditionPublicStyle {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const requested = String(value.publicStyle ?? "cinematic");
  return EDITION_PUBLIC_STYLE_IDS.includes(requested as EditionPublicStyle)
    ? (requested as EditionPublicStyle)
    : "cinematic";
}

function gradientFromRaw(input: unknown, first: string, second: string) {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (value.enabled === false) return null;
  const colors = Array.isArray(value.colors)
    ? value.colors.filter((color): color is string => typeof color === "string").slice(0, 3)
    : [];
  const stops = colors.length >= 2 ? colors : [first, second];
  const angle = clamp(value.angle, 0, 360, 135);
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}

export function resolveEditionPublicSettings(
  raw: unknown,
  theme: EditionDesignTheme,
): EditionPublicSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const style = resolveEditionPublicStyle(raw);

  return {
    style,
    radius: style === "editorial" || style === "minimal"
      ? 0
      : clamp(value.publicRadius, 0, 40, 24),
    surfaceStrength: clamp(value.publicSurfaceStrength, 45, 100, 82),
    heroGlow: clamp(value.publicHeroGlow, 0, 100, 72),
    focalX: clamp(value.publicFocalX, 0, 100, 50),
    focalY: clamp(value.publicFocalY, 0, 100, 50),
    accentGradient: gradientFromRaw(value.publicAccentGradient, theme.accent, theme.backgroundSecondary),
    surfaceGradient: gradientFromRaw(
      value.publicSurfaceGradient,
      theme.backgroundPrimary,
      theme.backgroundSecondary,
    ),
  };
}

export const EDITION_DESIGN_FIXTURES = [
  { id: "a", label: "Complete historical edition", artwork: true, entries: 36, results: true },
  { id: "b", label: "No artwork", artwork: false, entries: 22, results: true },
  { id: "c", label: "Long title and host city", artwork: true, entries: 18, results: false },
  { id: "d", label: "Sparse archive", artwork: false, entries: 0, results: false },
  { id: "e", label: "Large participant field", artwork: true, entries: 66, results: true },
] as const;
