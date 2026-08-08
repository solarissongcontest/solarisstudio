/**
 * Built-in scoreboard presets. Each one is a complete `ScoreboardConfig`
 * expressed with the shared engine — there is no bespoke component behind any
 * of them, so every preset is also a starting point for a custom template.
 */

import {
  SCOREBOARD_CONFIG_VERSION,
  type CardZoneConfig,
  type ScoreboardConfig,
  type SceneType,
} from "./types";
import { border, decoration, shadow, shape, surface, typo, zone } from "./resolve";

const baseCanvas = () => ({
  width: 1920,
  height: 1080,
  transparent: false,
  showSafeZones: false,
  zoom: 1,
});

const baseLayout = () => ({
  preset: "single",
  columns: 1 as const,
  rowsPerColumn: null,
  distribution: "sequential" as const,
  boardWidth: 900,
  boardHeight: null,
  positionX: 0,
  positionY: 0,
  rowGap: 8,
  columnGap: 24,
  alignment: "center" as const,
  verticalAlignment: "top" as const,
  safeMarginTop: 32,
  safeMarginRight: 48,
  safeMarginBottom: 32,
  safeMarginLeft: 48,
  columnHeadings: [],
  columnHeadingTypography: typo({ size: 12, uppercase: true, letterSpacing: 2, align: "center" }),
});

const baseHeader = () => ({
  visible: true,
  upper: {
    visible: true,
    text: "Solaris Song Contest",
    typography: typo({ size: 13, weight: 600, uppercase: true, letterSpacing: 4, color: "theme:accent", align: "center" }),
    offsetY: 0,
    shadow: shadow(),
  },
  main: {
    visible: true,
    text: "",
    typography: typo({ size: 34, weight: 800, color: "theme:text", align: "center" }),
    offsetY: 0,
    shadow: shadow(),
  },
  lineSpacing: 6,
  align: "center" as const,
  marginBottom: 20,
});

const baseFooter = () => ({
  visible: false,
  text: "",
  progressText: true,
  typography: typo({ size: 12, weight: 500, color: "theme:text", align: "center", uppercase: true, letterSpacing: 2 }),
  marginTop: 16,
});

const baseLogo = () => ({
  visible: false,
  url: null,
  width: 140,
  maxHeight: 90,
  align: "center" as const,
  marginTop: 18,
  opacity: 1,
  shadow: shadow(),
  position: "below-board" as const,
});

const baseBackground = () => ({
  type: "theme" as const,
  color: "#0b1024",
  gradientFrom: "#0a1030",
  gradientTo: "#2a0f45",
  gradientAngle: 135,
  imageUrl: null,
  videoUrl: null,
  pattern: "none" as const,
  patternOpacity: 0.2,
  overlay: 0,
  vignette: 0,
  blur: 0,
});

const basePanel = () => ({
  visible: false,
  side: "right" as const,
  size: 320,
  content: "current-voter" as const,
  imageUrl: null,
  surface: surface({ fill: "color", color: "#000000", opacity: 0.35 }),
  radius: 18,
  padding: 16,
  label: "",
});

const baseAnimation = () => ({
  enabled: true,
  rankMove: "spring" as const,
  duration: 0.45,
  scoreUpdate: "pop" as const,
  entry: "fade" as const,
  exit: "fade" as const,
  leaderChange: "glow" as const,
  winnerReveal: "confetti" as const,
  respectReducedMotion: true,
});

const baseMusic = () => ({
  enabled: false,
  youtubeUrl: "",
  volume: 35,
  loop: true,
  autoplay: false,
  startSeconds: 0,
  showPlayer: false,
});

const baseControls = () => ({
  mode: "expanded" as const,
  position: { x: 24, y: 24, anchor: "bottom-center" as const },
  snapToEdges: true,
  showRevealHandle: true,
  cleanOutput: false,
});

function makeConfig(
  name: string,
  sceneType: SceneType,
  card: ScoreboardConfig["card"],
  patch: Partial<ScoreboardConfig> = {},
): ScoreboardConfig {
  return {
    version: SCOREBOARD_CONFIG_VERSION,
    name,
    sceneType,
    canvas: baseCanvas(),
    layout: baseLayout(),
    card,
    header: baseHeader(),
    footer: baseFooter(),
    logo: baseLogo(),
    background: baseBackground(),
    panel: basePanel(),
    animation: baseAnimation(),
    music: baseMusic(),
    controls: baseControls(),
    ...patch,
  };
}

const baseCard = (zones: CardZoneConfig[], patch: Partial<ScoreboardConfig["card"]> = {}): ScoreboardConfig["card"] => ({
  preset: "custom",
  width: null,
  height: 54,
  minWidth: null,
  maxWidth: null,
  gap: 12,
  radius: 14,
  paddingX: 14,
  paddingY: 0,
  opacity: 1,
  overflow: "hidden",
  layoutMode: "flex",
  gridTemplate: "auto 1fr auto",
  background: surface({ fill: "color", color: "#ffffff", opacity: 0.08 }),
  border: border({ width: 1, color: "theme:card-border" }),
  shadow: shadow({ enabled: true }),
  glow: shadow({ enabled: false, color: "theme:primary", blur: 40, spread: -6, opacity: 0.8 }),
  zones,
  decorations: [],
  stateOverrides: {
    leader: { background: surface({ fill: "gradient", color: "theme:gold", color2: "theme:primary", opacity: 0.34 }) },
    active: { background: surface({ fill: "color", color: "theme:primary", opacity: 0.3 }) },
    winner: { background: surface({ fill: "gradient", color: "theme:gold", color2: "theme:secondary", opacity: 0.55 }) },
  },
  ...patch,
});

/* --------------------------------------------------------- zone builders -- */

const rankZone = (order: number, patch = {}) =>
  zone("rank", {
    id: "rank",
    order,
    width: 34,
    align: "center",
    typography: typo({ size: 15, weight: 800, color: "theme:rank", align: "center" }),
    ...patch,
  });

const flagZone = (order: number, patch = {}) =>
  zone("flag", {
    id: "flag",
    order,
    width: 46,
    height: 30,
    fit: "cover",
    shape: shape({ kind: "rounded", radius: 5 }),
    ...patch,
  });

const nameZone = (order: number, patch = {}) =>
  zone("country-name", {
    id: "country-name",
    order,
    grow: 1,
    typography: typo({ size: 16, weight: 700, color: "theme:country-name" }),
    ...patch,
  });

const scoreZone = (order: number, patch = {}) =>
  zone("score", {
    id: "score",
    order,
    width: 66,
    align: "right",
    typography: typo({ size: 20, weight: 800, color: "theme:country-score", align: "right" }),
    ...patch,
  });

const movementZone = (order: number, patch = {}) =>
  zone("movement", {
    id: "movement",
    order,
    width: 34,
    align: "center",
    typography: typo({ size: 12, weight: 700, color: "theme:text", align: "center" }),
    ...patch,
  });

/* ----------------------------------------------------------- the presets -- */

export const PRESET_IDS = [
  "clean-pill-results",
  "compact-interim-pills",
  "rectangular-movement-board",
  "dark-glass-final",
  "bright-ribbon-running-order",
  "ssc21",
  "classic-live-reveal",
  "minimal-flat-board",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export const PRESET_LABELS: Record<PresetId, string> = {
  "clean-pill-results": "Clean Pill Results",
  "compact-interim-pills": "Compact Interim Pills",
  "rectangular-movement-board": "Rectangular Movement Board",
  "dark-glass-final": "Dark Glass Final Results",
  "bright-ribbon-running-order": "Bright Ribbon Running Order",
  ssc21: "SSC21",
  "classic-live-reveal": "Classic Live Reveal",
  "minimal-flat-board": "Minimal Flat Board",
};

export const PRESET_DESCRIPTIONS: Record<PresetId, string> = {
  "clean-pill-results": "Rounded pill rows, generous spacing, neutral glass fill — the safe default for full results.",
  "compact-interim-pills": "Half-height pills in two columns for interim standings with many nations on screen.",
  "rectangular-movement-board": "Squared-off rows with a movement arrow column for tracking climbs during a reveal.",
  "dark-glass-final": "Heavy dark glass, soft glow, wide score column — designed for the final scoreboard.",
  "bright-ribbon-running-order": "Bright ribbon-shaped rows keyed to the running order rather than points.",
  ssc21: "Thin angled flag cards with layered diagonal transition bands and a rectangular score block.",
  "classic-live-reveal": "Traditional broadcast look: rank, flag, name, running total, with a strong leader state.",
  "minimal-flat-board": "Flat, borderless typography-first rows for a modern minimal broadcast.",
};

function cleanPill(): ScoreboardConfig {
  return makeConfig(
    "Clean Pill Results",
    "final-results",
    baseCard([rankZone(0), flagZone(1), nameZone(2), scoreZone(3)], {
      preset: "clean-pill-results",
      height: 56,
      radius: 999,
      paddingX: 18,
      background: surface({ fill: "color", color: "#ffffff", opacity: 0.1 }),
      border: border({ width: 1, color: "#ffffff" }),
    }),
  );
}

function compactInterim(): ScoreboardConfig {
  const cfg = makeConfig(
    "Compact Interim Pills",
    "interim-results",
    baseCard(
      [
        rankZone(0, { width: 26, typography: typo({ size: 12, weight: 800, color: "theme:rank", align: "center" }) }),
        flagZone(1, { width: 34, height: 22 }),
        nameZone(2, { typography: typo({ size: 13, weight: 600, color: "theme:country-name" }) }),
        scoreZone(3, { width: 48, typography: typo({ size: 15, weight: 800, color: "theme:country-score", align: "right" }) }),
      ],
      {
        preset: "compact-interim-pills",
        height: 38,
        radius: 999,
        gap: 8,
        paddingX: 12,
        shadow: shadow({ enabled: false }),
      },
    ),
  );
  cfg.layout = { ...cfg.layout, columns: 2, boardWidth: 1160, rowGap: 6, distribution: "sequential" };
  return cfg;
}

function movementBoard(): ScoreboardConfig {
  return makeConfig(
    "Rectangular Movement Board",
    "live-reveal",
    baseCard([rankZone(0), movementZone(1), flagZone(2, { shape: shape({ kind: "rect", radius: 0 }) }), nameZone(3), scoreZone(4)], {
      preset: "rectangular-movement-board",
      height: 50,
      radius: 0,
      background: surface({ fill: "color", color: "#0b1024", opacity: 0.72 }),
      border: border({ width: 1, color: "#ffffff" }),
    }),
  );
}

function darkGlassFinal(): ScoreboardConfig {
  const cfg = makeConfig(
    "Dark Glass Final Results",
    "final-results",
    baseCard(
      [
        rankZone(0, { width: 42, typography: typo({ size: 18, weight: 800, color: "theme:gold", align: "center" }) }),
        flagZone(1, { width: 54, height: 34, shape: shape({ kind: "rounded", radius: 8 }) }),
        nameZone(2, { typography: typo({ size: 19, weight: 700, color: "#ffffff" }) }),
        scoreZone(3, {
          width: 96,
          surface: surface({ fill: "color", color: "#ffffff", opacity: 0.1 }),
          shape: shape({ kind: "rounded", radius: 10 }),
          paddingX: 10,
          typography: typo({ size: 24, weight: 800, color: "#ffffff", align: "right" }),
        }),
      ],
      {
        preset: "dark-glass-final",
        height: 66,
        radius: 18,
        background: surface({ fill: "gradient", color: "#050914", color2: "#101a34", opacity: 0.85, angle: 100 }),
        border: border({ width: 1, color: "#ffffff" }),
        shadow: shadow({ enabled: true, blur: 40, spread: -18, opacity: 0.7 }),
        glow: shadow({ enabled: true, color: "theme:primary", blur: 46, spread: -14, opacity: 0.55 }),
      },
    ),
  );
  cfg.background = { ...cfg.background, overlay: 0.35, vignette: 0.4 };
  return cfg;
}

function brightRibbon(): ScoreboardConfig {
  return makeConfig(
    "Bright Ribbon Running Order",
    "running-order",
    baseCard(
      [
        zone("running-order", {
          id: "running-order",
          order: 0,
          width: 54,
          align: "center",
          leadingZero: true,
          surface: surface({ fill: "color", color: "country", opacity: 1 }),
          shape: shape({ kind: "wedge", rightSlant: 26 }),
          overlapRight: -10,
          z: 2,
          typography: typo({ size: 18, weight: 800, color: "#08101f", align: "center" }),
        }),
        flagZone(1, { width: 48, height: 30, marginX: 8 }),
        nameZone(2, { typography: typo({ size: 18, weight: 800, color: "#08101f", uppercase: true, letterSpacing: 1 }) }),
        zone("custom-text", {
          id: "subtitle",
          order: 3,
          width: 200,
          align: "right",
          typography: typo({ size: 12, weight: 600, color: "#08101f", align: "right" }),
        }),
      ],
      {
        preset: "bright-ribbon-running-order",
        height: 58,
        radius: 6,
        background: surface({ fill: "gradient", color: "#ffffff", color2: "#dbe7ff", opacity: 0.95, angle: 100 }),
        border: border({ width: 0 }),
        shadow: shadow({ enabled: true, blur: 20, spread: -12, opacity: 0.4 }),
        decorations: [
          decoration({
            id: "ribbon-tail",
            kind: "gradient",
            target: "card",
            x: 78,
            width: 22,
            color: "country",
            color2: "transparent",
            opacity: 0.35,
            angle: 90,
          }),
        ],
      },
    ),
  );
}

/** B6 — mandatory SSC21 visual system. */
function ssc21(): ScoreboardConfig {
  const diagonalBand = (
    id: string,
    order: number,
    width: number,
    color: string,
    z: number,
  ) =>
    zone("decoration", {
      id,
      order,
      width,
      height: 48,
      shape: shape({
        kind: "parallelogram",
        leftSlant: 24,
        rightSlant: 24,
        direction: "right",
      }),
      surface: surface({
        fill: "color",
        color,
        opacity: 1,
      }),
      overlapLeft: -10,
      overlapRight: -10,
      z,
    });

  const cfg = makeConfig(
    "SSC21",
    "final-results",
    baseCard(
      [
        // In the original SSC21 design the score is at the far left.
        zone("score", {
          id: "score",
          order: 0,
          width: 74,
          height: 48,
          align: "center",
          paddingX: 4,
          surface: surface({
            fill: "color",
            color: "#100724",
            opacity: 0.98,
          }),
          shape: shape({
            kind: "rect",
            radius: 0,
          }),
          typography: typo({
            family: "display",
            size: 17,
            minSize: 10,
            weight: 400,
            letterSpacing: 0.2,
            color: "#d6d2dc",
            align: "center",
          }),
          z: 8,
        }),

        // Blue-to-teal diagonal fan before the flag.
        diagonalBand("ssc21-navy-band", 1, 28, "#111340", 2),
        diagonalBand("ssc21-blue-band", 2, 28, "#153063", 3),
        diagonalBand("ssc21-teal-band", 3, 28, "#07545a", 4),

        // Flag sits in the middle of the diagonal transition.
        zone("flag", {
          id: "flag",
          order: 4,
          width: 78,
          height: 48,
          fit: "cover",
          objectPosition: "center",
          shape: shape({
            kind: "parallelogram",
            leftSlant: 14,
            rightSlant: 14,
            direction: "right",
          }),
          overlapLeft: -9,
          overlapRight: -10,
          z: 7,
        }),

        // Dark green fan after the flag.
        diagonalBand("ssc21-green-band-a", 5, 28, "#0a4b45", 6),
        diagonalBand("ssc21-green-band-b", 6, 28, "#173c32", 5),
        diagonalBand("ssc21-green-band-c", 7, 24, "#122d27", 4),

        // Long country-name bar on the right.
        zone("country-name", {
          id: "country-name",
          order: 8,
          grow: 1,
          height: 48,
          align: "left",
          paddingX: 22,
          surface: surface({
            fill: "gradient",
            color: "#101f17",
            color2: "#0b1510",
            opacity: 0.99,
            angle: 90,
          }),
          shape: shape({
            kind: "rect",
            radius: 0,
          }),
          overlapLeft: -9,
          typography: typo({
            family: "display",
            size: 16,
            minSize: 10,
            weight: 400,
            uppercase: true,
            letterSpacing: 1.35,
            color: "#c8c7ca",
            align: "left",
          }),
          z: 1,
        }),
      ],
      {
        preset: "ssc21",
        height: 48,
        radius: 0,
        gap: 0,
        paddingX: 0,
        paddingY: 0,
        opacity: 1,
        overflow: "visible",

        // The original look is made from the individual segments,
        // not from one generic blue card behind them.
        background: surface({
          fill: "none",
        }),
        border: border({
          width: 0,
        }),
        shadow: shadow({
          enabled: true,
          x: 0,
          y: 3,
          blur: 10,
          spread: -7,
          color: "#000000",
          opacity: 0.75,
        }),
        glow: shadow({
          enabled: false,
        }),
        decorations: [],
        stateOverrides: {},
      },
    ),
  );

  // Two dense result columns with the large gap seen in SSC21.
  cfg.layout = {
    ...cfg.layout,
    preset: "two-column",
    columns: 2,
    rowsPerColumn: null,
    distribution: "sequential",
    boardWidth: 1360,
    boardHeight: null,
    positionX: 0,
    positionY: 0,
    rowGap: 4,
    columnGap: 72,
    alignment: "center",
    verticalAlignment: "top",
    safeMarginTop: 150,
    safeMarginRight: 72,
    safeMarginBottom: 42,
    safeMarginLeft: 72,
    columnHeadings: [],
  };

  // Large two-line title like the reference:
  //
  // GRAND FINAL
  // RESULTS
  cfg.header = {
    ...cfg.header,
    visible: true,
    align: "center",
    marginBottom: 52,
    lineSpacing: -4,
    upper: {
      ...cfg.header.upper,
      visible: true,
      text: "GRAND FINAL",
      offsetY: 0,
      typography: typo({
        family: "display",
        size: 31,
        minSize: 17,
        weight: 300,
        uppercase: true,
        letterSpacing: 8,
        color: "#d0d2d7",
        align: "center",
      }),
    },
    main: {
      ...cfg.header.main,
      visible: true,
      text: "RESULTS",
      offsetY: -2,
      typography: typo({
        family: "display",
        size: 39,
        minSize: 22,
        weight: 700,
        uppercase: true,
        letterSpacing: 0.4,
        color: "#e4e5e8",
        align: "center",
      }),
    },
  };

  // The current scoreboard engine only has simple built-in patterns,
  // so this recreates the blue-to-green SSC21 atmosphere without
  // hard-coding an external image.
  cfg.background = {
    ...cfg.background,
    type: "gradient",
    color: "#132841",
    gradientFrom: "#172b50",
    gradientTo: "#17392f",
    gradientAngle: 180,
    imageUrl: null,
    videoUrl: null,
    pattern: "bands",
    patternOpacity: 0.12,
    overlay: 0.12,
    vignette: 0.2,
    blur: 0,
  };

  // ScoreboardBoard now falls back to the show's theme logo when url is null.
  cfg.logo = {
    ...cfg.logo,
    visible: true,
    url: null,
    width: 300,
    maxHeight: 135,
    align: "center",
    marginTop: 52,
    opacity: 0.96,
    position: "below-board",
  };

  cfg.footer = {
    ...cfg.footer,
    visible: false,
  };

  cfg.panel = {
    ...cfg.panel,
    visible: false,
  };

  return cfg;
}

function classicLive(): ScoreboardConfig {
  return makeConfig(
    "Classic Live Reveal",
    "live-reveal",
    baseCard([rankZone(0), flagZone(1), nameZone(2), zone("jury-score", { id: "jury", order: 3, width: 44, align: "right", typography: typo({ size: 12, weight: 700, color: "theme:jury", align: "right" }) }), zone("televote-score", { id: "televote", order: 4, width: 44, align: "right", typography: typo({ size: 12, weight: 700, color: "theme:televote", align: "right" }) }), scoreZone(5)], {
      preset: "classic-live-reveal",
      height: 52,
      radius: 10,
      background: surface({ fill: "color", color: "#ffffff", opacity: 0.07 }),
      border: border({ width: 1, color: "theme:card-border" }),
    }),
  );
}

function minimalFlat(): ScoreboardConfig {
  return makeConfig(
    "Minimal Flat Board",
    "final-results",
    baseCard(
      [
        rankZone(0, { width: 30, typography: typo({ size: 13, weight: 500, color: "theme:rank", align: "left" }) }),
        nameZone(1, { typography: typo({ size: 17, weight: 500, color: "theme:country-name", letterSpacing: 0.4 }) }),
        scoreZone(2, { typography: typo({ size: 17, weight: 700, color: "theme:country-score", align: "right" }) }),
      ],
      {
        preset: "minimal-flat-board",
        height: 44,
        radius: 0,
        background: surface({ fill: "none" }),
        border: border({ width: 0 }),
        shadow: shadow({ enabled: false }),
        decorations: [
          decoration({
            id: "hairline",
            kind: "accent-bar",
            target: "card",
            x: 0,
            y: 99,
            width: 100,
            height: 1,
            unit: "%",
            color: "#ffffff",
            opacity: 0.16,
          }),
        ],
        stateOverrides: {
          leader: { background: surface({ fill: "color", color: "theme:primary", opacity: 0.12 }) },
        },
      },
    ),
  );
}

const BUILDERS: Record<PresetId, () => ScoreboardConfig> = {
  "clean-pill-results": cleanPill,
  "compact-interim-pills": compactInterim,
  "rectangular-movement-board": movementBoard,
  "dark-glass-final": darkGlassFinal,
  "bright-ribbon-running-order": brightRibbon,
  ssc21,
  "classic-live-reveal": classicLive,
  "minimal-flat-board": minimalFlat,
};

/** Fresh deep copy — presets are templates, never shared mutable state. */
export function buildPreset(id: PresetId): ScoreboardConfig {
  return (BUILDERS[id] ?? cleanPill)();
}

export const DEFAULT_SCOREBOARD_PRESET: PresetId = "clean-pill-results";

export function defaultScoreboard(): ScoreboardConfig {
  return buildPreset(DEFAULT_SCOREBOARD_PRESET);
}
