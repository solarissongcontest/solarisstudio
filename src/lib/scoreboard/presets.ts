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
  const cfg = makeConfig(
    "SSC21",
    "live-reveal",
    baseCard(
      [
        zone("flag", {
          id: "flag",
          order: 0,
          width: 74,
          height: 44,
          fit: "cover",
          objectPosition: "center",
          shape: shape({ kind: "parallelogram", leftSlant: 22, direction: "right" }),
          overlapRight: -14,
          z: 3,
        }),
        zone("decoration", {
          id: "transition-band",
          order: 1,
          width: 34,
          shape: shape({ kind: "parallelogram", leftSlant: 40, direction: "right" }),
          surface: surface({ fill: "gradient", color: "country", color2: "transparent", opacity: 0.85, angle: 90 }),
          overlapLeft: -14,
          overlapRight: -12,
          z: 2,
        }),
        nameZone(2, {
          grow: 1,
          paddingX: 10,
          typography: typo({
            size: 17,
            weight: 800,
            uppercase: true,
            letterSpacing: 1.5,
            color: "#ffffff",
          }),
        }),
        zone("score", {
          id: "score",
          order: 3,
          width: 86,
          align: "center",
          surface: surface({ fill: "color", color: "#ffffff", opacity: 0.95 }),
          shape: shape({ kind: "rect", radius: 0 }),
          typography: typo({ size: 24, weight: 900, color: "#08101f", align: "center" }),
          z: 4,
        }),
      ],
      {
        preset: "ssc21",
        height: 46,
        radius: 0,
        gap: 0,
        paddingX: 0,
        overflow: "hidden",
        background: surface({ fill: "gradient", color: "#0d1734", color2: "#1b2a55", opacity: 0.94, angle: 92 }),
        border: border({ width: 0 }),
        shadow: shadow({ enabled: true, y: 6, blur: 18, spread: -12, opacity: 0.6 }),
        glow: shadow({ enabled: false }),
        decorations: [
          decoration({
            id: "diag-band-1",
            kind: "gradient",
            target: "card",
            x: 8,
            width: 26,
            color: "country",
            color2: "transparent",
            opacity: 0.55,
            angle: 100,
            shape: shape({ kind: "parallelogram", leftSlant: 55 }),
            z: 1,
          }),
          decoration({
            id: "diag-band-2",
            kind: "stripe",
            target: "card",
            x: 26,
            width: 6,
            color: "#ffffff",
            opacity: 0.14,
            shape: shape({ kind: "parallelogram", leftSlant: 120 }),
            z: 1,
          }),
          decoration({
            id: "score-edge",
            kind: "accent-bar",
            target: "card",
            x: 95.2,
            width: 0.8,
            color: "country",
            opacity: 0.9,
            z: 5,
          }),
        ],
        stateOverrides: {
          active: { background: surface({ fill: "gradient", color: "country", color2: "#0d1734", opacity: 0.9, angle: 92 }) },
          leader: { background: surface({ fill: "gradient", color: "#243a7a", color2: "#0d1734", opacity: 0.96, angle: 92 }) },
          winner: { background: surface({ fill: "gradient", color: "theme:gold", color2: "#0d1734", opacity: 0.95, angle: 92 }) },
        },
      },
    ),
  );
  cfg.layout = { ...cfg.layout, columns: 2, boardWidth: 1280, rowGap: 5, columnGap: 28 };
  cfg.header = {
    ...cfg.header,
    upper: { ...cfg.header.upper, text: "Solaris Song Contest", typography: typo({ size: 12, uppercase: true, letterSpacing: 6, weight: 700, color: "theme:accent", align: "center" }) },
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
