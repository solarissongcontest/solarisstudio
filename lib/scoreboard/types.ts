/**
 * Universal broadcast scoreboard configuration model.
 *
 * Four layers, deliberately separated so the organizer can build new looks by
 * combining configuration instead of by asking for new components:
 *
 *  1. Scene data      — `BroadcastRowData`, one normalized row shape for both
 *                       global countries and edition-only contest entities.
 *  2. Board layout    — canvas, columns, distribution, header/footer/logo/panels.
 *  3. Card structure  — ordered, individually configurable zones inside one row.
 *  4. Appearance      — surfaces, shapes, typography, decorations, state overrides.
 */

/* ------------------------------------------------------------------ data -- */

export type BroadcastRowData = {
  id: string;
  entityType: "global" | "custom";

  name: string;
  abbreviation: string;
  flagImage: string | null;
  /** Per-row accent (country colour) used by `country` colour tokens. */
  accent: string;

  rank: number | null;
  runningOrder: number | null;

  score: number | null;
  juryScore: number | null;
  televoteScore: number | null;

  movement: number | null;

  qualified: boolean | null;
  eliminated: boolean | null;

  active: boolean;
  highlighted: boolean;
  leader: boolean;
  winner: boolean;

  /** Optional free text a scene can surface in a `custom-text` zone. */
  subtitle?: string | null;
};

export type RowState =
  | "active"
  | "highlighted"
  | "leader"
  | "qualified"
  | "eliminated"
  | "winner";

/* --------------------------------------------------------------- styling -- */

/**
 * A colour is either a literal CSS colour, `transparent`, a theme token
 * (`theme:primary`), or the per-row country accent (`country`).
 */
export type ColorToken = string;

export type SurfaceConfig = {
  fill: "none" | "color" | "gradient" | "country" | "theme";
  color: ColorToken;
  color2: ColorToken;
  angle: number;
  opacity: number;
  blur: number;
};

export type BorderConfig = {
  width: number;
  color: ColorToken;
  style: "solid" | "dashed" | "none";
};

export type ShadowConfig = {
  enabled: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: ColorToken;
  opacity: number;
  inset?: boolean;
};

export type TypographyConfig = {
  /** `display` / `body` inherit the theme fonts; anything else is a family name. */
  family: string;
  size: number;
  minSize: number;
  weight: number;
  letterSpacing: number;
  uppercase: boolean;
  color: ColorToken;
  align: "left" | "center" | "right";
  truncate: boolean;
  italic?: boolean;
};

export type ShapeKind =
  | "rect"
  | "rounded"
  | "pill"
  | "circle"
  | "square"
  | "tab"
  | "ribbon"
  | "trapezoid"
  | "wedge"
  | "parallelogram"
  | "polygon";

export type ShapeConfig = {
  kind: ShapeKind;
  radius: number;
  /** Percentage insets driving the polygonal clip paths. */
  leftSlant: number;
  rightSlant: number;
  topInset: number;
  bottomInset: number;
  direction: "right" | "left";
  /** `polygon` only — raw percentage points. */
  points: Array<[number, number]>;
};

export type DecorationKind =
  | "solid"
  | "gradient"
  | "image"
  | "pattern"
  | "stripe"
  | "accent-bar"
  | "highlight-edge"
  | "glow"
  | "shadow"
  | "blur"
  | "country-tint"
  | "theme-tint"
  | "sweep"
  | "mask";

export type DecorationConfig = {
  id: string;
  kind: DecorationKind;
  /** `card` or a zone id. */
  target: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Percent (`%`) or pixels for x/y/width/height. */
  unit: "%" | "px";
  color: ColorToken;
  color2: ColorToken;
  opacity: number;
  angle: number;
  blend: string;
  radius: number;
  imageUrl: string | null;
  shape: ShapeConfig;
  z: number;
};

/* ----------------------------------------------------------------- zones -- */

export type ZoneType =
  | "rank"
  | "running-order"
  | "flag"
  | "country-name"
  | "score"
  | "jury-score"
  | "televote-score"
  | "movement"
  | "qualification"
  | "custom-text"
  | "image"
  | "spacer"
  | "decoration";

export type CardZoneConfig = {
  id: string;
  /** Editor-facing name; falls back to the zone type. */
  label?: string;
  type: ZoneType;

  visible: boolean;
  locked?: boolean;
  order: number;

  width: number | null;
  minWidth: number | null;
  maxWidth: number | null;
  height: number | null;
  grow: number;

  paddingX: number;
  paddingY: number;
  marginX: number;

  align: "left" | "center" | "right";
  valign: "top" | "center" | "bottom";

  z: number;
  overlapLeft: number;
  overlapRight: number;

  shape: ShapeConfig;
  surface: SurfaceConfig;
  border?: BorderConfig;
  typography?: TypographyConfig;

  /** `flag` zones. */
  fit?: "cover" | "contain" | "fill";
  objectPosition?: string;
  /** `custom-text` / `image` zones. */
  text?: string;
  imageUrl?: string | null;
  /** `running-order` / `rank`: pad to `01`, `02`, … */
  leadingZero?: boolean;
  /** `score` zones: what to print when the value is null. */
  emptyText?: string;
  /** absolute layout mode only */
  absolute?: { x: number; y: number };
};

export type CardStyleConfig = {
  background: SurfaceConfig;
  border: BorderConfig;
  shadow: ShadowConfig;
  radius: number;
  opacity: number;
  scale: number;
  textColor: ColorToken;
};

export type CardTemplateConfig = {
  preset: string;

  width: number | null;
  height: number;
  minWidth: number | null;
  maxWidth: number | null;
  gap: number;
  radius: number;
  paddingX: number;
  paddingY: number;
  opacity: number;
  overflow: "hidden" | "visible";

  layoutMode: "flex" | "grid" | "absolute";
  gridTemplate: string;

  background: SurfaceConfig;
  border: BorderConfig;
  shadow: ShadowConfig;
  glow: ShadowConfig;

  zones: CardZoneConfig[];
  decorations: DecorationConfig[];

  stateOverrides: Partial<Record<RowState, Partial<CardStyleConfig>>>;
};

/* ---------------------------------------------------------------- board --- */

export type BoardLayoutConfig = {
  preset: string;

  columns: 1 | 2 | 3 | 4;
  rowsPerColumn: number | null;
  distribution: "sequential" | "balanced" | "manual";

  boardWidth: number;
  boardHeight: number | null;

  positionX: number;
  positionY: number;

  rowGap: number;
  columnGap: number;

  alignment: "left" | "center" | "right";
  verticalAlignment: "top" | "center" | "bottom";

  safeMarginTop: number;
  safeMarginRight: number;
  safeMarginBottom: number;
  safeMarginLeft: number;

  /** Per-column headings (allocation draw, semi-final splits). */
  columnHeadings: string[];
  columnHeadingTypography: TypographyConfig;
};

export type CanvasConfig = {
  width: number;
  height: number;
  transparent: boolean;
  showSafeZones: boolean;
  zoom: number;
};

export type HeaderLineConfig = {
  visible: boolean;
  text: string;
  typography: TypographyConfig;
  offsetY: number;
  shadow: ShadowConfig;
};

export type HeaderConfig = {
  visible: boolean;
  upper: HeaderLineConfig;
  main: HeaderLineConfig;
  lineSpacing: number;
  align: "left" | "center" | "right";
  marginBottom: number;
};

export type FooterConfig = {
  visible: boolean;
  text: string;
  progressText: boolean;
  typography: TypographyConfig;
  marginTop: number;
};

export type LogoConfig = {
  visible: boolean;
  url: string | null;
  width: number;
  maxHeight: number;
  align: "left" | "center" | "right";
  marginTop: number;
  opacity: number;
  shadow: ShadowConfig;
  position: "header" | "below-board";
};

export type BackgroundConfig = {
  type: "theme" | "gradient" | "color" | "image" | "video" | "transparent" | "pattern";
  color: ColorToken;
  gradientFrom: ColorToken;
  gradientTo: ColorToken;
  gradientAngle: number;
  imageUrl: string | null;
  videoUrl: string | null;
  pattern: "none" | "solaris-geometric" | "bands" | "grid";
  patternOpacity: number;
  overlay: number;
  vignette: number;
  blur: number;
};

export type PanelConfig = {
  visible: boolean;
  side: "left" | "right" | "top" | "bottom" | "floating";
  size: number;
  content: "media" | "image" | "current-voter" | "point-strip" | "progress" | "logo" | "placeholder";
  imageUrl: string | null;
  surface: SurfaceConfig;
  radius: number;
  padding: number;
  label: string;
};

export type AnimationConfig = {
  enabled: boolean;
  rankMove: "spring" | "tween" | "none";
  duration: number;
  scoreUpdate: "count" | "pop" | "none";
  entry: "fade" | "slide" | "scale" | "none";
  exit: "fade" | "scale" | "none";
  leaderChange: "flash" | "glow" | "none";
  winnerReveal: "confetti" | "fireworks" | "none";
  respectReducedMotion: boolean;
};

export type MusicConfig = {
  enabled: boolean;
  /** YouTube URL or bare video id. */
  youtubeUrl: string;
  volume: number;
  loop: boolean;
  autoplay: boolean;
  startSeconds: number;
  showPlayer: boolean;
};

export type BroadcastControlConfig = {
  mode: "expanded" | "compact" | "hidden";
  position: {
    x: number;
    y: number;
    anchor:
      | "free"
      | "top-left"
      | "top-center"
      | "top-right"
      | "bottom-left"
      | "bottom-center"
      | "bottom-right";
  };
  snapToEdges: boolean;
  showRevealHandle: boolean;
  cleanOutput: boolean;
};

export type SceneType =
  | "running-order"
  | "jury-standings"
  | "televote-standings"
  | "interim-results"
  | "final-results"
  | "live-reveal"
  | "qualifiers"
  | "allocation"
  | "participants";

export type ScoreboardConfig = {
  version: number;
  name?: string;
  sceneType: SceneType;
  canvas: CanvasConfig;
  layout: BoardLayoutConfig;
  card: CardTemplateConfig;
  header: HeaderConfig;
  footer: FooterConfig;
  logo: LogoConfig;
  background: BackgroundConfig;
  panel: PanelConfig;
  animation: AnimationConfig;
  music: MusicConfig;
  controls: BroadcastControlConfig;
};

export const SCOREBOARD_CONFIG_VERSION = 2;
