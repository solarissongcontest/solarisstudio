/**
 * Theme / Design Engine.
 * A ThemeConfig fully describes how a show looks on screen and in broadcast:
 * background, palette, typography, card geometry, flag shape and board layout.
 */

export type BackgroundConfig = {
  type: "gradient" | "color" | "image";
  color: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  imageUrl: string | null;
  overlay: number; // 0..1 darkening overlay
  blur: number; // px
  animated: boolean;
};

export type ColorConfig = {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  jury: string;
  televote: string;
  gold: string;
};

export type CardConfig = {
  shape: "rounded" | "square" | "pill";
  radius: number;
  height: number;
  gap: number;
  opacity: number; // 0..1 card background alpha
  blur: number;
  borderWidth: number;
  useCountryColor: boolean;
  shadow: boolean;
};

export type FlagConfig = {
  shape: "rect" | "rounded" | "circle" | "square";
  width: number;
  ratio: number; // height = width / ratio
  border: boolean;
};

export type LayoutConfig = {
  mode: "single" | "two-column" | "grid";
  maxVisible: number;
  showRank: boolean;
  showArtist: boolean;
  showSplit: boolean;
  align: "left" | "center";
};

export type ThemeConfig = {
  background: BackgroundConfig;
  colors: ColorConfig;
  fontDisplay: string;
  fontBody: string;
  card: CardConfig;
  flag: FlagConfig;
  layout: LayoutConfig;
  logoUrl: string | null;
};

export const FONT_OPTIONS = [
  { label: "Sora", value: "Sora" },
  { label: "Manrope", value: "Manrope" },
  { label: "Space Grotesk", value: "Space Grotesk" },
  { label: "Syne", value: "Syne" },
  { label: "Outfit", value: "Outfit" },
  { label: "Bebas Neue", value: "Bebas Neue" },
  { label: "Playfair Display", value: "Playfair Display" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
] as const;

export const DEFAULT_THEME: ThemeConfig = {
  background: {
    type: "gradient",
    color: "#0b1024",
    gradientFrom: "#0a1030",
    gradientTo: "#2a0f45",
    gradientAngle: 135,
    imageUrl: null,
    overlay: 0.25,
    blur: 0,
    animated: true,
  },
  colors: {
    primary: "#4fd1ff",
    secondary: "#b16cff",
    accent: "#ff6fd8",
    text: "#f4f7ff",
    jury: "#4fd1ff",
    televote: "#ff6fd8",
    gold: "#ffcc4d",
  },
  fontDisplay: "Sora",
  fontBody: "Manrope",
  card: {
    shape: "rounded",
    radius: 14,
    height: 52,
    gap: 6,
    opacity: 0.12,
    blur: 14,
    borderWidth: 1,
    useCountryColor: true,
    shadow: true,
  },
  flag: { shape: "rounded", width: 44, ratio: 1.5, border: true },
  layout: {
    mode: "single",
    maxVisible: 26,
    showRank: true,
    showArtist: true,
    showSplit: true,
    align: "left",
  },
  logoUrl: null,
};

/** Deep-merge a partial (possibly legacy/empty) JSON blob onto the defaults. */
export function resolveTheme(raw: unknown): ThemeConfig {
  const t = (raw ?? {}) as Partial<ThemeConfig>;
  return {
    background: { ...DEFAULT_THEME.background, ...(t.background ?? {}) },
    colors: { ...DEFAULT_THEME.colors, ...(t.colors ?? {}) },
    fontDisplay: t.fontDisplay ?? DEFAULT_THEME.fontDisplay,
    fontBody: t.fontBody ?? DEFAULT_THEME.fontBody,
    card: { ...DEFAULT_THEME.card, ...(t.card ?? {}) },
    flag: { ...DEFAULT_THEME.flag, ...(t.flag ?? {}) },
    layout: { ...DEFAULT_THEME.layout, ...(t.layout ?? {}) },
    logoUrl: t.logoUrl ?? null,
  };
}

/** CSS custom properties for a themed surface (stage, preview, broadcast). */
export function themeVars(t: ThemeConfig): React.CSSProperties {
  return {
    ["--t-primary" as string]: t.colors.primary,
    ["--t-secondary" as string]: t.colors.secondary,
    ["--t-accent" as string]: t.colors.accent,
    ["--t-text" as string]: t.colors.text,
    ["--t-jury" as string]: t.colors.jury,
    ["--t-televote" as string]: t.colors.televote,
    ["--t-gold" as string]: t.colors.gold,
    ["--t-radius" as string]: `${t.card.shape === "pill" ? t.card.height / 2 : t.card.shape === "square" ? 0 : t.card.radius}px`,
    ["--t-card-h" as string]: `${t.card.height}px`,
    ["--t-gap" as string]: `${t.card.gap}px`,
    ["--t-font-display" as string]: `"${t.fontDisplay}", system-ui, sans-serif`,
    ["--t-font-body" as string]: `"${t.fontBody}", system-ui, sans-serif`,
    color: t.colors.text,
    fontFamily: `"${t.fontBody}", system-ui, sans-serif`,
  };
}

export function backgroundStyle(t: ThemeConfig): React.CSSProperties {
  const b = t.background;
  if (b.type === "image" && b.imageUrl) {
    return {
      backgroundImage: `url(${b.imageUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (b.type === "color") return { background: b.color };
  return {
    background: `linear-gradient(${b.gradientAngle}deg, ${b.gradientFrom}, ${b.gradientTo})`,
  };
}

export function flagStyle(t: ThemeConfig): React.CSSProperties {
  const f = t.flag;
  const h = f.shape === "circle" || f.shape === "square" ? f.width : Math.round(f.width / f.ratio);
  return {
    width: f.width,
    height: h,
    borderRadius: f.shape === "circle" ? "9999px" : f.shape === "rounded" ? "6px" : "2px",
    border: f.border ? "1px solid rgba(255,255,255,0.35)" : "none",
    objectFit: "cover",
    flexShrink: 0,
  };
}
