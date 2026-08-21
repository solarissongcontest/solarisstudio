export type EditionBackgroundMode = "gradient" | "artwork" | "solid";
export type EditionGradientStyle = "linear" | "radial" | "aurora";
export type EditionHeroLayout = "cinematic" | "editorial" | "minimal" | "broadcast" | "glass";
export type EditionDecorationStyle = "artwork" | "orbits" | "stars" | "none";
export type EditionCardStyle = "soft" | "glass" | "solid";

export type EditionAppearance = {
  backgroundMode: EditionBackgroundMode;
  gradientStyle: EditionGradientStyle;
  gradientAngle: number;
  backgroundTertiary: string | null;
  heroLayout: EditionHeroLayout;
  decorationStyle: EditionDecorationStyle;
  cardStyle: EditionCardStyle;
  artworkPositionX: number;
  artworkPositionY: number;
  artworkOverlay: number;
};

export const DEFAULT_EDITION_APPEARANCE: EditionAppearance = {
  backgroundMode: "gradient",
  gradientStyle: "aurora",
  gradientAngle: 145,
  backgroundTertiary: null,
  heroLayout: "cinematic",
  decorationStyle: "artwork",
  cardStyle: "soft",
  artworkPositionX: 50,
  artworkPositionY: 50,
  artworkOverlay: 0.52,
};

const isHex = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());

const number = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function editionAppearanceFromConfig(input: unknown): EditionAppearance {
  if (!input || typeof input !== "object") return { ...DEFAULT_EDITION_APPEARANCE };
  const value = input as Record<string, unknown>;
  const backgroundMode = ["gradient", "artwork", "solid"].includes(String(value.backgroundMode))
    ? (value.backgroundMode as EditionBackgroundMode)
    : DEFAULT_EDITION_APPEARANCE.backgroundMode;
  const gradientStyle = ["linear", "radial", "aurora"].includes(String(value.gradientStyle))
    ? (value.gradientStyle as EditionGradientStyle)
    : DEFAULT_EDITION_APPEARANCE.gradientStyle;
  const heroLayout = ["cinematic", "editorial", "minimal", "broadcast", "glass"].includes(String(value.heroLayout))
    ? (value.heroLayout as EditionHeroLayout)
    : DEFAULT_EDITION_APPEARANCE.heroLayout;
  const decorationStyle = ["artwork", "orbits", "stars", "none"].includes(String(value.decorationStyle))
    ? (value.decorationStyle as EditionDecorationStyle)
    : DEFAULT_EDITION_APPEARANCE.decorationStyle;
  const cardStyle = ["soft", "glass", "solid"].includes(String(value.cardStyle))
    ? (value.cardStyle as EditionCardStyle)
    : DEFAULT_EDITION_APPEARANCE.cardStyle;

  return {
    backgroundMode,
    gradientStyle,
    gradientAngle: number(value.gradientAngle, 0, 360, DEFAULT_EDITION_APPEARANCE.gradientAngle),
    backgroundTertiary: isHex(value.backgroundTertiary) ? value.backgroundTertiary.toLowerCase() : null,
    heroLayout,
    decorationStyle,
    cardStyle,
    artworkPositionX: number(value.artworkPositionX, 0, 100, 50),
    artworkPositionY: number(value.artworkPositionY, 0, 100, 50),
    artworkOverlay: number(value.artworkOverlay, 0, 0.9, DEFAULT_EDITION_APPEARANCE.artworkOverlay),
  };
}

export function editionBackgroundCss(
  appearance: EditionAppearance,
  colours: { backgroundPrimary: string; backgroundSecondary: string; accent: string },
  artworkUrl?: string | null,
) {
  const third = appearance.backgroundTertiary || colours.accent;
  if (appearance.backgroundMode === "solid") return colours.backgroundPrimary;

  if (appearance.backgroundMode === "artwork" && artworkUrl) {
    const overlay = Math.round(appearance.artworkOverlay * 1000) / 1000;
    return `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${Math.min(.94, overlay + .12)})), url(${JSON.stringify(artworkUrl)})`;
  }

  if (appearance.gradientStyle === "linear") {
    return `linear-gradient(${appearance.gradientAngle}deg, ${colours.backgroundPrimary} 0%, ${colours.backgroundSecondary} 56%, ${third} 135%)`;
  }
  if (appearance.gradientStyle === "radial") {
    return `radial-gradient(circle at 72% 18%, ${third}66, transparent 38%), radial-gradient(circle at 18% 78%, ${colours.backgroundSecondary}bb, ${colours.backgroundPrimary} 72%)`;
  }
  return `radial-gradient(circle at 82% 12%, ${third}55, transparent 34%), radial-gradient(circle at 12% 74%, ${colours.backgroundSecondary}99, transparent 48%), linear-gradient(${appearance.gradientAngle}deg, ${colours.backgroundPrimary}, ${colours.backgroundSecondary})`;
}
