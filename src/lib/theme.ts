import type {
  CSSProperties,
} from "react";

import type {
  ScoreboardConfig,
} from "./scoreboard/types";

/**
 * Edition theme / branding engine.
 *
 * The theme owns:
 * - backdrop
 * - edition palette
 * - typography
 * - logo
 *
 * Custom country cards are owned by ScoreboardConfig.
 *
 * The legacy card/text/state/chrome/flag/layout fields are kept so old
 * saved themes and older UI surfaces remain readable. New editing should
 * happen through ScoreboardEditor instead of directly changing them.
 */

export type BackgroundConfig = {
  type:
    | "gradient"
    | "color"
    | "image";

  color:
    string;

  gradientFrom:
    string;

  gradientTo:
    string;

  gradientAngle:
    number;

  imageUrl:
    string | null;

  overlay:
    number;

  blur:
    number;

  animated:
    boolean;
};

export type ColorConfig = {
  primary:
    string;

  secondary:
    string;

  accent:
    string;

  text:
    string;

  jury:
    string;

  televote:
    string;

  gold:
    string;
};

/**
 * Legacy card values.
 *
 * These remain for backwards compatibility only.
 * New card editing belongs to ThemeConfig.scoreboardConfig.
 */
export type CardConfig = {
  shape:
    | "rounded"
    | "square"
    | "pill";

  radius:
    number;

  height:
    number;

  gap:
    number;

  padding:
    number;

  opacity:
    number;

  blur:
    number;

  borderWidth:
    number;

  borderColor:
    string;

  useCountryColor:
    boolean;

  backgroundMode:
    | "solid"
    | "glass"
    | "country-tinted"
    | "gradient";

  backgroundColor:
    string;

  shadow:
    boolean;

  shadowStrength:
    number;

  shadowColor:
    string;
};

export type TextConfig = {
  countryName:
    string;

  countryScore:
    string;

  artistSong:
    string;

  rank:
    string;
};

export type StatesConfig = {
  leaderBackground:
    string;

  leaderBorder:
    string;

  leaderText:
    string;

  highlight:
    string;

  votingBackground:
    string;

  votingText:
    string;

  selected:
    string;

  hover:
    string;

  qualified:
    string;
};

export type ChromeConfig = {
  headerBackground:
    string;

  headerText:
    string;

  panelBackground:
    string;

  panelText:
    string;

  progressTrack:
    string;

  progressFill:
    string;

  spokespersonBackground:
    string;

  spokespersonText:
    string;

  spokespersonAccent:
    string;
};

export type RevealConfig = {
  juryPresentation:
    | "all-individually"
    | "top3-individually"
    | "twelve-only";
};

export type FlagConfig = {
  shape:
    | "rect"
    | "rounded"
    | "circle"
    | "square";

  width:
    number;

  ratio:
    number;

  border:
    boolean;
};

export type LayoutConfig = {
  mode:
    | "single"
    | "two-column"
    | "grid";

  maxVisible:
    number;

  showRank:
    boolean;

  showArtist:
    boolean;

  showSplit:
    boolean;

  align:
    | "left"
    | "center";
};

export type ThemeConfig = {
  background:
    BackgroundConfig;

  colors:
    ColorConfig;

  fontDisplay:
    string;

  fontBody:
    string;

  /**
   * THE real edition-wide custom scoreboard/card design.
   *
   * Optional so old saved themes continue to load safely.
   */
  scoreboardConfig?:
    ScoreboardConfig | null;

  /*
   * Legacy compatibility fields.
   * No longer edited directly by ThemeEditor.
   */
  card:
    CardConfig;

  text:
    TextConfig;

  states:
    StatesConfig;

  chrome:
    ChromeConfig;

  reveal:
    RevealConfig;

  flag:
    FlagConfig;

  layout:
    LayoutConfig;

  logoUrl:
    string | null;
};

export const FONT_OPTIONS = [
  {
    label:
      "Sora",

    value:
      "Sora",
  },

  {
    label:
      "Manrope",

    value:
      "Manrope",
  },

  {
    label:
      "Space Grotesk",

    value:
      "Space Grotesk",
  },

  {
    label:
      "Syne",

    value:
      "Syne",
  },

  {
    label:
      "Outfit",

    value:
      "Outfit",
  },

  {
    label:
      "Bebas Neue",

    value:
      "Bebas Neue",
  },

  {
    label:
      "Playfair Display",

    value:
      "Playfair Display",
  },

  {
    label:
      "JetBrains Mono",

    value:
      "JetBrains Mono",
  },
] as const;

export const DEFAULT_THEME: ThemeConfig = {
  background: {
    type:
      "gradient",

    color:
      "#0b1024",

    gradientFrom:
      "#0a1030",

    gradientTo:
      "#2a0f45",

    gradientAngle:
      135,

    imageUrl:
      null,

    overlay:
      0.25,

    blur:
      0,

    animated:
      true,
  },

  colors: {
    primary:
      "#4fd1ff",

    secondary:
      "#b16cff",

    accent:
      "#ff6fd8",

    text:
      "#f4f7ff",

    jury:
      "#4fd1ff",

    televote:
      "#ff6fd8",

    gold:
      "#ffcc4d",
  },

  fontDisplay:
    "Sora",

  fontBody:
    "Manrope",

  scoreboardConfig:
    null,

  card: {
    shape:
      "rounded",

    radius:
      14,

    height:
      52,

    gap:
      6,

    padding:
      12,

    opacity:
      0.12,

    blur:
      14,

    borderWidth:
      1,

    borderColor:
      "#f4f7ff",

    useCountryColor:
      true,

    backgroundMode:
      "country-tinted",

    backgroundColor:
      "#f4f7ff",

    shadow:
      true,

    shadowStrength:
      0.9,

    shadowColor:
      "#000000",
  },

  text: {
    countryName:
      "#f4f7ff",

    countryScore:
      "#f4f7ff",

    artistSong:
      "#f4f7ff",

    rank:
      "#f4f7ff",
  },

  states: {
    leaderBackground:
      "#ffcc4d",

    leaderBorder:
      "#ffcc4d",

    leaderText:
      "#08101f",

    highlight:
      "#4fd1ff",

    votingBackground:
      "#4fd1ff",

    votingText:
      "#08101f",

    selected:
      "#4fd1ff",

    hover:
      "#ffffff",

    qualified:
      "#ffcc4d",
  },

  chrome: {
    headerBackground:
      "#ffffff1a",

    headerText:
      "#f4f7ff",

    panelBackground:
      "#ffffff14",

    panelText:
      "#f4f7ff",

    progressTrack:
      "#ffffff1a",

    progressFill:
      "#4fd1ff",

    spokespersonBackground:
      "#ffffff1a",

    spokespersonText:
      "#f4f7ff",

    spokespersonAccent:
      "#4fd1ff",
  },

  reveal: {
    juryPresentation:
      "all-individually",
  },

  flag: {
    shape:
      "rounded",

    width:
      44,

    ratio:
      1.5,

    border:
      true,
  },

  layout: {
    mode:
      "single",

    maxVisible:
      26,

    showRank:
      true,

    showArtist:
      true,

    showSplit:
      true,

    align:
      "left",
  },

  logoUrl:
    null,
};

/**
 * Deep-merge a possibly old/partial saved theme onto the defaults.
 *
 * scoreboardConfig is preserved as-is because resolveScoreboard() performs
 * its own normalisation when it is rendered.
 */
export function resolveTheme(
  raw:
    unknown,
): ThemeConfig {
  const theme =
    (
      raw ??
      {}
    ) as
      Partial<ThemeConfig>;

  return {
    background: {
      ...DEFAULT_THEME.background,

      ...(
        theme.background ??
        {}
      ),
    },

    colors: {
      ...DEFAULT_THEME.colors,

      ...(
        theme.colors ??
        {}
      ),
    },

    fontDisplay:
      theme.fontDisplay ??
      DEFAULT_THEME.fontDisplay,

    fontBody:
      theme.fontBody ??
      DEFAULT_THEME.fontBody,

    scoreboardConfig:
      theme.scoreboardConfig ??
      null,

    card: {
      ...DEFAULT_THEME.card,

      ...(
        theme.card ??
        {}
      ),
    },

    text: {
      ...DEFAULT_THEME.text,

      ...(
        theme.text ??
        {}
      ),
    },

    states: {
      ...DEFAULT_THEME.states,

      ...(
        theme.states ??
        {}
      ),
    },

    chrome: {
      ...DEFAULT_THEME.chrome,

      ...(
        theme.chrome ??
        {}
      ),
    },

    reveal: {
      ...DEFAULT_THEME.reveal,

      ...(
        theme.reveal ??
        {}
      ),
    },

    flag: {
      ...DEFAULT_THEME.flag,

      ...(
        theme.flag ??
        {}
      ),
    },

    layout: {
      ...DEFAULT_THEME.layout,

      ...(
        theme.layout ??
        {}
      ),
    },

    logoUrl:
      theme.logoUrl ??
      null,
  };
}

/**
 * Theme presets now only alter true edition-branding values.
 *
 * They intentionally do not touch country-card design because that belongs
 * to ScoreboardEditor.
 */
export const THEME_PRESETS: {
  label:
    string;

  description:
    string;

  make:
    () =>
      Partial<ThemeConfig>;
}[] = [
  {
    label:
      "Solaris Classic",

    description:
      "The default Solaris neon gradient branding.",

    make:
      () => ({
        background:
          {
            ...DEFAULT_THEME.background,
          },

        colors:
          {
            ...DEFAULT_THEME.colors,
          },

        fontDisplay:
          DEFAULT_THEME.fontDisplay,

        fontBody:
          DEFAULT_THEME.fontBody,
      }),
  },

  {
    label:
      "Midnight Aurora",

    description:
      "Deep blue-violet edition branding with cyan accents.",

    make:
      () => ({
        background:
          {
            ...DEFAULT_THEME.background,

            gradientFrom:
              "#06132f",

            gradientTo:
              "#27104f",

            gradientAngle:
              135,
          },

        colors:
          {
            ...DEFAULT_THEME.colors,

            primary:
              "#72e5ff",

            secondary:
              "#9771ff",

            accent:
              "#ff7cda",

            jury:
              "#72e5ff",

            televote:
              "#ff7cda",
          },
      }),
  },

  {
    label:
      "Golden Gala",

    description:
      "Warm gold and ink branding for a prestige final.",

    make:
      () => ({
        background:
          {
            ...DEFAULT_THEME.background,

            gradientFrom:
              "#1a1206",

            gradientTo:
              "#3a2308",
          },

        colors: {
          primary:
            "#ffcc4d",

          secondary:
            "#ff9a3c",

          accent:
            "#ffe08a",

          text:
            "#fff7e6",

          jury:
            "#ffcc4d",

          televote:
            "#ff9a3c",

          gold:
            "#fff2b0",
        },
      }),
  },
];

/**
 * CSS variables kept for legacy/common surfaces.
 *
 * Custom country cards themselves are rendered from ScoreboardConfig and
 * do not depend on these legacy card variables.
 */
export function themeVars(
  theme:
    ThemeConfig,
): CSSProperties {
  return {
    [
      "--t-primary" as string
    ]:
      theme.colors.primary,

    [
      "--t-secondary" as string
    ]:
      theme.colors.secondary,

    [
      "--t-accent" as string
    ]:
      theme.colors.accent,

    [
      "--t-text" as string
    ]:
      theme.colors.text,

    [
      "--t-jury" as string
    ]:
      theme.colors.jury,

    [
      "--t-televote" as string
    ]:
      theme.colors.televote,

    [
      "--t-gold" as string
    ]:
      theme.colors.gold,

    [
      "--t-radius" as string
    ]:
      `${
        theme.card.shape ===
        "pill"
          ? theme.card.height /
            2
          : theme.card.shape ===
              "square"
            ? 0
            : theme.card.radius
      }px`,

    [
      "--t-card-h" as string
    ]:
      `${theme.card.height}px`,

    [
      "--t-card-padding" as string
    ]:
      `${theme.card.padding}px`,

    [
      "--t-card-border-color" as string
    ]:
      theme.card.borderColor,

    [
      "--t-card-border-width" as string
    ]:
      `${theme.card.borderWidth}px`,

    [
      "--t-card-bg-color" as string
    ]:
      theme.card.backgroundColor,

    [
      "--t-card-shadow-color" as string
    ]:
      theme.card.shadowColor,

    [
      "--t-gap" as string
    ]:
      `${theme.card.gap}px`,

    [
      "--t-font-display" as string
    ]:
      `"${theme.fontDisplay}", system-ui, sans-serif`,

    [
      "--t-font-body" as string
    ]:
      `"${theme.fontBody}", system-ui, sans-serif`,

    [
      "--t-text-country" as string
    ]:
      theme.text.countryName,

    [
      "--t-text-score" as string
    ]:
      theme.text.countryScore,

    [
      "--t-text-artist" as string
    ]:
      theme.text.artistSong,

    [
      "--t-text-rank" as string
    ]:
      theme.text.rank,

    [
      "--t-leader-bg" as string
    ]:
      theme.states.leaderBackground,

    [
      "--t-leader-border" as string
    ]:
      theme.states.leaderBorder,

    [
      "--t-leader-text" as string
    ]:
      theme.states.leaderText,

    [
      "--t-highlight" as string
    ]:
      theme.states.highlight,

    [
      "--t-voting-bg" as string
    ]:
      theme.states.votingBackground,

    [
      "--t-voting-text" as string
    ]:
      theme.states.votingText,

    [
      "--t-selected" as string
    ]:
      theme.states.selected,

    [
      "--t-hover" as string
    ]:
      theme.states.hover,

    [
      "--t-qualified" as string
    ]:
      theme.states.qualified,

    [
      "--t-header-bg" as string
    ]:
      theme.chrome.headerBackground,

    [
      "--t-header-text" as string
    ]:
      theme.chrome.headerText,

    [
      "--t-panel-bg" as string
    ]:
      theme.chrome.panelBackground,

    [
      "--t-panel-text" as string
    ]:
      theme.chrome.panelText,

    [
      "--t-progress-track" as string
    ]:
      theme.chrome.progressTrack,

    [
      "--t-progress-fill" as string
    ]:
      theme.chrome.progressFill,

    [
      "--t-spokesperson-bg" as string
    ]:
      theme.chrome.spokespersonBackground,

    [
      "--t-spokesperson-text" as string
    ]:
      theme.chrome.spokespersonText,

    [
      "--t-spokesperson-accent" as string
    ]:
      theme.chrome.spokespersonAccent,

    color:
      theme.colors.text,

    fontFamily:
      `"${theme.fontBody}", system-ui, sans-serif`,
  } as CSSProperties;
}

export function backgroundStyle(
  theme:
    ThemeConfig,
): CSSProperties {
  const background =
    theme.background;

  if (
    background.type ===
      "image" &&
    background.imageUrl
  ) {
    return {
      backgroundImage:
        `url(${background.imageUrl})`,

      backgroundSize:
        "cover",

      backgroundPosition:
        "center",
    };
  }

  if (
    background.type ===
    "color"
  ) {
    return {
      background:
        background.color,
    };
  }

  return {
    background:
      `linear-gradient(${background.gradientAngle}deg, ${background.gradientFrom}, ${background.gradientTo})`,
  };
}

/**
 * Legacy helper kept for any remaining non-scoreboard surfaces.
 */
export function flagStyle(
  theme:
    ThemeConfig,
): CSSProperties {
  const flag =
    theme.flag;

  const height =
    flag.shape ===
      "circle" ||
    flag.shape ===
      "square"
      ? flag.width
      : Math.round(
          flag.width /
            flag.ratio,
        );

  return {
    width:
      flag.width,

    height,

    borderRadius:
      flag.shape ===
      "circle"
        ? "9999px"
        : flag.shape ===
            "rounded"
          ? "6px"
          : "2px",

    border:
      flag.border
        ? "1px solid rgba(255,255,255,0.35)"
        : "none",

    objectFit:
      "cover",

    flexShrink:
      0,
  };
}

/**
 * Legacy helper kept for backwards-compatible non-custom surfaces.
 */
export function cardBackground(
  theme:
    ThemeConfig,

  accent:
    string,

  hexA:
    (
      hex:
        string,

      alpha:
        number,
    ) =>
      string,
): string {
  const card =
    theme.card;

  switch (
    card.backgroundMode
  ) {
    case "solid":
      return hexA(
        card.backgroundColor,

        Math.max(
          card.opacity,
          0.85,
        ),
      );

    case "gradient":
      return `linear-gradient(135deg, ${hexA(
        accent,
        Math.min(
          1,
          card.opacity +
            0.18,
        ),
      )}, ${hexA(
        card.backgroundColor,
        card.opacity,
      )})`;

    case "country-tinted":
      return hexA(
        accent,
        card.opacity,
      );

    case "glass":
    default:
      return hexA(
        card.backgroundColor,
        card.opacity,
      );
  }
}
