/**
 * Theme / Design Engine.
 * A ThemeConfig fully describes how a show looks on screen and in broadcast:
 * background, palette, typography, card geometry, flag shape, board layout,
 * and granular per-element colours/states/chrome used across the stage and
 * the broadcast page.
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

/** Country card look: fill mode, border, shadow, glass/opacity, geometry & spacing. */
export type CardConfig = {
  shape: "rounded" | "square" | "pill";
  radius: number;
  height: number;
  gap: number;
  padding: number;
  opacity: number; // 0..1 card background alpha (legacy "glass strength")
  blur: number;
  borderWidth: number;
  borderColor: string;
  useCountryColor: boolean; // legacy alias — kept for old presets
  backgroundMode: "solid" | "glass" | "country-tinted" | "gradient";
  backgroundColor: string;
  shadow: boolean;
  shadowStrength: number; // 0..1
  shadowColor: string;
};

/** Colours for the pieces of text drawn on a country row. */
export type TextConfig = {
  countryName: string;
  countryScore: string;
  artistSong: string;
  rank: string;
};

/** Special states: leader, highlighted/currently-voting, selected, hover, qualified. */
export type StatesConfig = {
  leaderBackground: string;
  leaderBorder: string;
  leaderText: string;
  highlight: string;
  votingBackground: string;
  votingText: string;
  selected: string;
  hover: string;
  qualified: string;
};

/** Broadcast chrome: header, side panel, progress bar, spokesperson card. */
export type ChromeConfig = {
  headerBackground: string;
  headerText: string;
  panelBackground: string;
  panelText: string;
  progressTrack: string;
  progressFill: string;
  spokespersonBackground: string;
  spokespersonText: string;
  spokespersonAccent: string;
};

/** How jury votes are paced out during the broadcast reveal. */
export type RevealConfig = {
  juryPresentation: "all-individually" | "top3-individually" | "twelve-only";
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
  text: TextConfig;
  states: StatesConfig;
  chrome: ChromeConfig;
  reveal: RevealConfig;
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
    padding: 12,
    opacity: 0.12,
    blur: 14,
    borderWidth: 1,
    borderColor: "#f4f7ff",
    useCountryColor: true,
    backgroundMode: "country-tinted",
    backgroundColor: "#f4f7ff",
    shadow: true,
    shadowStrength: 0.9,
    shadowColor: "#000000",
  },
  text: {
    countryName: "#f4f7ff",
    countryScore: "#f4f7ff",
    artistSong: "#f4f7ff",
    rank: "#f4f7ff",
  },
  states: {
    leaderBackground: "#ffcc4d",
    leaderBorder: "#ffcc4d",
    leaderText: "#08101f",
    highlight: "#4fd1ff",
    votingBackground: "#4fd1ff",
    votingText: "#08101f",
    selected: "#4fd1ff",
    hover: "#ffffff",
    qualified: "#ffcc4d",
  },
  chrome: {
    headerBackground: "#ffffff1a",
    headerText: "#f4f7ff",
    panelBackground: "#ffffff14",
    panelText: "#f4f7ff",
    progressTrack: "#ffffff1a",
    progressFill: "#4fd1ff",
    spokespersonBackground: "#ffffff1a",
    spokespersonText: "#f4f7ff",
    spokespersonAccent: "#4fd1ff",
  },
  reveal: {
    juryPresentation: "all-individually",
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
    text: { ...DEFAULT_THEME.text, ...(t.text ?? {}) },
    states: { ...DEFAULT_THEME.states, ...(t.states ?? {}) },
    chrome: { ...DEFAULT_THEME.chrome, ...(t.chrome ?? {}) },
    reveal: { ...DEFAULT_THEME.reveal, ...(t.reveal ?? {}) },
    flag: { ...DEFAULT_THEME.flag, ...(t.flag ?? {}) },
    layout: { ...DEFAULT_THEME.layout, ...(t.layout ?? {}) },
    logoUrl: t.logoUrl ?? null,
  };
}

/** Named theme presets an organiser can apply in one click. */
export const THEME_PRESETS: { label: string; description: string; make: () => Partial<ThemeConfig> }[] = [
  {
    label: "Solaris Classic",
    description: "The default neon gradient look.",
    make: () => ({}),
  },
  {
    label: "Liquid Glass",
    description: "Heavy blur, translucent cards, soft white text.",
    make: () => ({
      card: {
        ...DEFAULT_THEME.card,
        backgroundMode: "glass",
        opacity: 0.22,
        blur: 28,
        borderWidth: 1,
        borderColor: "#ffffff",
        shadow: true,
        shadowStrength: 0.6,
      },
    }),
  },
  {
    label: "High Contrast Broadcast",
    description: "Opaque solid cards, bold borders, no blur — great for streaming compression.",
    make: () => ({
      card: {
        ...DEFAULT_THEME.card,
        backgroundMode: "solid",
        backgroundColor: "#11162a",
        opacity: 0.94,
        blur: 0,
        borderWidth: 2,
        borderColor: "#4fd1ff",
      },
      states: {
        ...DEFAULT_THEME.states,
        leaderBackground: "#ffcc4d",
        leaderText: "#08101f",
        highlight: "#ff6fd8",
      },
    }),
  },
  {
    label: "Golden Gala",
    description: "Warm gold & ink palette for a prestige awards feel.",
    make: () => ({
      colors: { primary: "#ffcc4d", secondary: "#ff9a3c", accent: "#ffe08a", text: "#fff7e6", jury: "#ffcc4d", televote: "#ff9a3c", gold: "#fff2b0" },
      background: { ...DEFAULT_THEME.background, gradientFrom: "#1a1206", gradientTo: "#3a2308" },
      card: { ...DEFAULT_THEME.card, backgroundMode: "gradient", borderColor: "#ffcc4d" },
    }),
  },
  {
    label: "Country-Tinted Vivid",
    description: "Cards tinted by each country's accent colour — punchy and colourful.",
    make: () => ({
      card: { ...DEFAULT_THEME.card, backgroundMode: "country-tinted", opacity: 0.3, useCountryColor: true },
    }),
  },
];

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
    ["--t-card-padding" as string]: `${t.card.padding}px`,
    ["--t-card-border-color" as string]: t.card.borderColor,
    ["--t-card-border-width" as string]: `${t.card.borderWidth}px`,
    ["--t-card-bg-color" as string]: t.card.backgroundColor,
    ["--t-card-shadow-color" as string]: t.card.shadowColor,
    ["--t-gap" as string]: `${t.card.gap}px`,
    ["--t-font-display" as string]: `"${t.fontDisplay}", system-ui, sans-serif`,
    ["--t-font-body" as string]: `"${t.fontBody}", system-ui, sans-serif`,
    // text
    ["--t-text-country" as string]: t.text.countryName,
    ["--t-text-score" as string]: t.text.countryScore,
    ["--t-text-artist" as string]: t.text.artistSong,
    ["--t-text-rank" as string]: t.text.rank,
    // states
    ["--t-leader-bg" as string]: t.states.leaderBackground,
    ["--t-leader-border" as string]: t.states.leaderBorder,
    ["--t-leader-text" as string]: t.states.leaderText,
    ["--t-highlight" as string]: t.states.highlight,
    ["--t-voting-bg" as string]: t.states.votingBackground,
    ["--t-voting-text" as string]: t.states.votingText,
    ["--t-selected" as string]: t.states.selected,
    ["--t-hover" as string]: t.states.hover,
    ["--t-qualified" as string]: t.states.qualified,
    // chrome
    ["--t-header-bg" as string]: t.chrome.headerBackground,
    ["--t-header-text" as string]: t.chrome.headerText,
    ["--t-panel-bg" as string]: t.chrome.panelBackground,
    ["--t-panel-text" as string]: t.chrome.panelText,
    ["--t-progress-track" as string]: t.chrome.progressTrack,
    ["--t-progress-fill" as string]: t.chrome.progressFill,
    ["--t-spokesperson-bg" as string]: t.chrome.spokespersonBackground,
    ["--t-spokesperson-text" as string]: t.chrome.spokespersonText,
    ["--t-spokesperson-accent" as string]: t.chrome.spokespersonAccent,
    color: t.colors.text,
    fontFamily: `"${t.fontBody}", system-ui, sans-serif`,
  } as React.CSSProperties;
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

/**
 * Compute the country-card background for a given accent colour, honouring
 * backgroundMode (solid / glass / country-tinted / gradient).
 */
export function cardBackground(t: ThemeConfig, accent: string, hexA: (hex: string, a: number) => string): string {
  const c = t.card;
  switch (c.backgroundMode) {
    case "solid":
      return hexA(c.backgroundColor, Math.max(c.opacity, 0.85));
    case "gradient":
      return `linear-gradient(135deg, ${hexA(accent, c.opacity + 0.18)}, ${hexA(c.backgroundColor, c.opacity)})`;
    case "country-tinted":
      return hexA(accent, c.opacity);
    case "glass":
    default:
      return hexA(c.backgroundColor, c.opacity);
  }
}
