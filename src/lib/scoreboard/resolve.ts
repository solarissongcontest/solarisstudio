/**
 * Defaults, resolution helpers and versioned migration for the scoreboard model.
 *
 * Everything that turns configuration into CSS lives here so the renderer stays
 * a thin, predictable component and the same maths is testable in isolation.
 */

import type { ThemeConfig } from "../theme";
import {
  SCOREBOARD_CONFIG_VERSION,
  type BorderConfig,
  type BroadcastRowData,
  type CardZoneConfig,
  type ColorToken,
  type DecorationConfig,
  type RowState,
  type ScoreboardConfig,
  type ShadowConfig,
  type ShapeConfig,
  type SurfaceConfig,
  type TypographyConfig,
  type ZoneType,
} from "./types";

/* --------------------------------------------------------------- colours -- */

/** Hex (#rgb/#rrggbb) → rgba(). Non-hex values pass through untouched. */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec((color ?? "").trim());
  if (!m) return color;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((x) => x + x)
      .join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export type ColorContext = { theme: ThemeConfig; accent?: string };

const THEME_TOKENS: Record<string, (t: ThemeConfig) => string> = {
  primary: (t) => t.colors.primary,
  secondary: (t) => t.colors.secondary,
  accent: (t) => t.colors.accent,
  text: (t) => t.colors.text,
  jury: (t) => t.colors.jury,
  televote: (t) => t.colors.televote,
  gold: (t) => t.colors.gold,
  leader: (t) => t.states.leaderBackground,
  highlight: (t) => t.states.highlight,
  qualified: (t) => t.states.qualified,
  "card-border": (t) => t.card.borderColor,
  "country-name": (t) => t.text.countryName,
  "country-score": (t) => t.text.countryScore,
  rank: (t) => t.text.rank,
};

/**
 * Resolves a colour token. `country` uses the row accent so one template can be
 * reused by every nation; `theme:x` keeps a board in sync with the show theme.
 */
export function resolveColor(token: ColorToken | undefined, ctx: ColorContext): string {
  if (!token) return "transparent";
  const value = token.trim();
  if (value === "country") return ctx.accent ?? ctx.theme.colors.primary;
  if (value.startsWith("theme:")) {
    const key = value.slice(6);
    return THEME_TOKENS[key]?.(ctx.theme) ?? ctx.theme.colors.primary;
  }
  return value;
}

/* ---------------------------------------------------------------- shapes -- */

/** Clip-path for the polygonal card/zone shapes (SSC21 slants, ribbons, wedges). */
export function clipPathFor(shape: ShapeConfig | undefined): string | undefined {
  if (!shape) return undefined;
  const l = Math.max(0, shape.leftSlant);
  const r = Math.max(0, shape.rightSlant);
  const t = Math.max(0, shape.topInset);
  const b = Math.max(0, shape.bottomInset);
  const flip = shape.direction === "left";

  const poly = (pts: Array<[number, number]>) =>
    `polygon(${pts.map(([x, y]) => `${round(x)}% ${round(y)}%`).join(", ")})`;

  switch (shape.kind) {
    case "parallelogram": {
      const s = l || r || 12;
      return flip
        ? poly([
            [0, 0],
            [100, 0],
            [100 - s, 100],
            [0 + 0, 100],
          ])
        : poly([
            [s, 0],
            [100, 0],
            [100 - s, 100],
            [0, 100],
          ]);
    }
    case "trapezoid":
      return poly([
        [l, 0],
        [100 - r, 0],
        [100, 100],
        [0, 100],
      ]);
    case "wedge":
      return flip
        ? poly([
            [0, 0],
            [100, 0],
            [100, 100],
            [l || 14, 100],
          ])
        : poly([
            [0, 0],
            [100 - (r || 14), 0],
            [100, 100],
            [0, 100],
          ]);
    case "ribbon":
      return poly([
        [0, 0],
        [100 - (r || 10), 0],
        [100, 50],
        [100 - (r || 10), 100],
        [0, 100],
      ]);
    case "tab":
      return poly([
        [0, t],
        [100 - (r || 8), t],
        [100, 50],
        [100 - (r || 8), 100 - b],
        [0, 100 - b],
      ]);
    case "polygon":
      return shape.points.length >= 3 ? poly(shape.points) : undefined;
    default:
      return undefined;
  }
}

export function borderRadiusFor(shape: ShapeConfig | undefined, fallback: number): string {
  if (!shape) return `${fallback}px`;
  switch (shape.kind) {
    case "pill":
      return "999px";
    case "circle":
      return "50%";
    case "rect":
    case "square":
      return "0px";
    case "rounded":
      return `${shape.radius}px`;
    default:
      return `${shape.radius}px`;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

/* -------------------------------------------------------------- surfaces -- */

export function surfaceBackground(surface: SurfaceConfig | undefined, ctx: ColorContext): string | undefined {
  if (!surface || surface.fill === "none") return undefined;
  const a = surface.opacity;
  switch (surface.fill) {
    case "color":
      return withAlpha(resolveColor(surface.color, ctx), a);
    case "country":
      return withAlpha(ctx.accent ?? ctx.theme.colors.primary, a);
    case "theme":
      return withAlpha(ctx.theme.colors.primary, a);
    case "gradient":
      return `linear-gradient(${surface.angle}deg, ${withAlpha(
        resolveColor(surface.color, ctx),
        a,
      )}, ${withAlpha(resolveColor(surface.color2, ctx), a)})`;
    default:
      return undefined;
  }
}

export function borderCss(border: BorderConfig | undefined, ctx: ColorContext): string | undefined {
  if (!border || border.style === "none" || border.width <= 0) return undefined;
  return `${border.width}px ${border.style} ${resolveColor(border.color, ctx)}`;
}

export function shadowCss(shadow: ShadowConfig | undefined, ctx: ColorContext): string | undefined {
  if (!shadow?.enabled) return undefined;
  const color = withAlpha(resolveColor(shadow.color, ctx), shadow.opacity);
  return `${shadow.inset ? "inset " : ""}${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${color}`;
}

export function typographyCss(
  typo: TypographyConfig | undefined,
  ctx: ColorContext,
  scale = 1,
): React.CSSProperties {
  if (!typo) return {};
  const family =
    typo.family === "display"
      ? "var(--t-font-display)"
      : typo.family === "body"
        ? "var(--t-font-body)"
        : typo.family;
  return {
    fontFamily: family,
    fontSize: Math.max(typo.minSize, typo.size * scale),
    fontWeight: typo.weight,
    letterSpacing: typo.letterSpacing,
    textTransform: typo.uppercase ? "uppercase" : undefined,
    color: resolveColor(typo.color, ctx),
    textAlign: typo.align,
    fontStyle: typo.italic ? "italic" : undefined,
  };
}

/* ------------------------------------------------------------ row states -- */

/** Highest-priority state first — winner beats leader beats active, etc. */
export function rowStates(row: BroadcastRowData): RowState[] {
  const s: RowState[] = [];
  if (row.winner) s.push("winner");
  if (row.leader) s.push("leader");
  if (row.active) s.push("active");
  if (row.highlighted) s.push("highlighted");
  if (row.qualified) s.push("qualified");
  if (row.eliminated) s.push("eliminated");
  return s;
}

/* ------------------------------------------------------------ distribute -- */

/** Splits rows across board columns using the configured distribution rule. */
export function distributeRows<T>(
  rows: T[],
  columns: number,
  distribution: "sequential" | "balanced" | "manual",
  rowsPerColumn: number | null,
): T[][] {
  const cols = Math.max(1, Math.min(4, columns));
  if (cols === 1) return [rows];
  const out: T[][] = Array.from({ length: cols }, () => []);

  if (distribution === "manual" && rowsPerColumn && rowsPerColumn > 0) {
    rows.forEach((r, i) => {
      const col = Math.min(cols - 1, Math.floor(i / rowsPerColumn));
      out[col].push(r);
    });
    return out;
  }

  if (distribution === "balanced") {
    rows.forEach((r, i) => out[i % cols].push(r));
    return out;
  }

  const per = Math.ceil(rows.length / cols);
  rows.forEach((r, i) => out[Math.min(cols - 1, Math.floor(i / per))].push(r));
  return out;
}

/* ---------------------------------------------------------- default bits -- */

export const surface = (patch: Partial<SurfaceConfig> = {}): SurfaceConfig => ({
  fill: "none",
  color: "#ffffff",
  color2: "#000000",
  angle: 90,
  opacity: 1,
  blur: 0,
  ...patch,
});

export const shape = (patch: Partial<ShapeConfig> = {}): ShapeConfig => ({
  kind: "rounded",
  radius: 10,
  leftSlant: 0,
  rightSlant: 0,
  topInset: 0,
  bottomInset: 0,
  direction: "right",
  points: [],
  ...patch,
});

export const border = (patch: Partial<BorderConfig> = {}): BorderConfig => ({
  width: 0,
  color: "theme:card-border",
  style: "solid",
  ...patch,
});

export const shadow = (patch: Partial<ShadowConfig> = {}): ShadowConfig => ({
  enabled: false,
  x: 0,
  y: 10,
  blur: 26,
  spread: -16,
  color: "#000000",
  opacity: 0.55,
  ...patch,
});

export const typo = (patch: Partial<TypographyConfig> = {}): TypographyConfig => ({
  family: "display",
  size: 15,
  minSize: 9,
  weight: 700,
  letterSpacing: 0,
  uppercase: false,
  color: "theme:country-name",
  align: "left",
  truncate: true,
  ...patch,
});

let zoneSeq = 0;
export const zone = (type: ZoneType, patch: Partial<CardZoneConfig> = {}): CardZoneConfig => ({
  id: patch.id ?? `${type}-${++zoneSeq}`,
  type,
  visible: true,
  order: patch.order ?? 0,
  width: null,
  minWidth: null,
  maxWidth: null,
  height: null,
  grow: 0,
  paddingX: 0,
  paddingY: 0,
  marginX: 0,
  align: "left",
  valign: "center",
  z: 1,
  overlapLeft: 0,
  overlapRight: 0,
  shape: shape({ kind: "rect", radius: 0 }),
  surface: surface(),
  typography: typo(),
  ...patch,
});

export const decoration = (patch: Partial<DecorationConfig> = {}): DecorationConfig => ({
  id: patch.id ?? `dec-${Math.random().toString(36).slice(2, 8)}`,
  kind: "solid",
  target: "card",
  visible: true,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  unit: "%",
  color: "#ffffff",
  color2: "#000000",
  opacity: 0.2,
  angle: 90,
  blend: "normal",
  radius: 0,
  imageUrl: null,
  shape: shape({ kind: "rect", radius: 0 }),
  z: 0,
  ...patch,
});

/* ----------------------------------------------------------- deep resolve -- */

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Deep merge that keeps arrays authoritative (zones/decorations replace wholesale). */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(patch)) return base;
  const out: Plain = { ...(base as unknown as Plain) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const b = out[k];
    out[k] = isPlain(v) && isPlain(b) ? deepMerge(b, v) : v;
  }
  return out as unknown as T;
}

/**
 * Versioned migration. v0/v1 stored only pacing settings (`BroadcastConfig`);
 * those shows keep working and simply adopt the default board.
 */
export function migrateScoreboard(raw: unknown, base: ScoreboardConfig): ScoreboardConfig {
  if (!isPlain(raw)) return base;
  const version = typeof raw.version === "number" ? raw.version : 0;
  const source = isPlain(raw.scoreboard) ? raw.scoreboard : raw;
  if (version < SCOREBOARD_CONFIG_VERSION && !isPlain(source.card) && !isPlain(source.layout)) {
    return base;
  }
  const merged = deepMerge(base, source);
  merged.version = SCOREBOARD_CONFIG_VERSION;
  if (!Array.isArray(merged.card.zones) || merged.card.zones.length === 0) {
    merged.card.zones = base.card.zones;
  }
  if (!Array.isArray(merged.card.decorations)) merged.card.decorations = base.card.decorations;
  return merged;
}

export const sortedZones = (zones: CardZoneConfig[]) =>
  [...zones].sort((a, b) => a.order - b.order);
