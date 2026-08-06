"use client";

/**
 * Zone-based country card. Every visual property comes from configuration —
 * this component never hard-codes a look, which is what lets one engine render
 * pills, ribbons, rectangles and the angled SSC21 cards.
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import {
  borderCss,
  borderRadiusFor,
  clipPathFor,
  resolveColor,
  rowStates,
  shadowCss,
  sortedZones,
  surfaceBackground,
  typographyCss,
  withAlpha,
  type BroadcastRowData,
  type CardTemplateConfig,
  type CardZoneConfig,
  type DecorationConfig,
} from "@/lib/scoreboard";
import type { ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function CountryCard({
  card,
  theme,
  row,
  awarded,
  scale = 1,
  animate = true,
  className,
}: {
  card: CardTemplateConfig;
  theme: ThemeConfig;
  row: BroadcastRowData;
  awarded?: number | null;
  scale?: number;
  animate?: boolean;
  className?: string;
}) {
  const ctx = { theme, accent: row.accent };
  const states = rowStates(row);

  // Highest-priority matching state wins; unset keys fall back to the base card.
  const override = states.reduce<Partial<NonNullable<CardTemplateConfig["stateOverrides"]["leader"]>>>(
    (acc, s) => (Object.keys(acc).length ? acc : (card.stateOverrides?.[s] ?? {})),
    {},
  );

  const background = surfaceBackground(override.background ?? card.background, ctx);
  const cardBorder = borderCss(override.border ?? card.border, ctx);
  const shadows = [shadowCss(override.shadow ?? card.shadow, ctx), shadowCss(card.glow, ctx)]
    .filter(Boolean)
    .join(", ");

  const style: CSSProperties = {
    position: "relative",
    display: card.layoutMode === "grid" ? "grid" : "flex",
    gridTemplateColumns: card.layoutMode === "grid" ? card.gridTemplate : undefined,
    alignItems: "center",
    gap: card.layoutMode === "absolute" ? 0 : card.gap * scale,
    height: card.height * scale,
    width: card.width ? card.width * scale : "100%",
    minWidth: card.minWidth ? card.minWidth * scale : undefined,
    maxWidth: card.maxWidth ? card.maxWidth * scale : undefined,
    paddingLeft: card.paddingX * scale,
    paddingRight: card.paddingX * scale,
    paddingTop: card.paddingY * scale,
    paddingBottom: card.paddingY * scale,
    borderRadius: (override.radius ?? card.radius) * scale,
    background,
    border: cardBorder,
    boxShadow: shadows || undefined,
    opacity: override.opacity ?? card.opacity,
    overflow: card.overflow,
    color: resolveColor(override.textColor ?? "theme:text", ctx),
    backdropFilter: card.background.blur ? `blur(${card.background.blur}px)` : undefined,
  };

  const zones = sortedZones(card.zones).filter((z) => z.visible);
  const cardDecorations = (card.decorations ?? []).filter((d) => d.visible && d.target === "card");

  const Wrapper = animate ? motion.li : ("li" as unknown as typeof motion.li);

  return (
    <Wrapper
      layout={animate}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn("list-none", className)}
      style={style}
    >
      {cardDecorations.map((d) => (
        <Decoration key={d.id} decoration={d} theme={theme} accent={row.accent} />
      ))}

      {zones.map((z) => (
        <Zone
          key={z.id}
          zone={z}
          card={card}
          row={row}
          theme={theme}
          scale={scale}
          decorations={(card.decorations ?? []).filter((d) => d.visible && d.target === z.id)}
        />
      ))}

      {awarded != null && awarded !== 0 && (
        <motion.span
          key={`award-${awarded}`}
          initial={{ scale: 0.6, opacity: 0, x: 14 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          className="numeric grid shrink-0 place-items-center rounded-lg px-2 py-1 font-bold"
          style={{
            position: "relative",
            zIndex: 8,
            fontSize: 14 * scale,
            background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`,
            color: "#08101f",
          }}
        >
          +{awarded}
        </motion.span>
      )}
    </Wrapper>
  );
}

/* ------------------------------------------------------------------ zone -- */

function Zone({
  zone,
  card,
  row,
  theme,
  scale,
  decorations,
}: {
  zone: CardZoneConfig;
  card: CardTemplateConfig;
  row: BroadcastRowData;
  theme: ThemeConfig;
  scale: number;
  decorations: DecorationConfig[];
}) {
  const ctx = { theme, accent: row.accent };
  const style: CSSProperties = {
    position: card.layoutMode === "absolute" && zone.absolute ? "absolute" : "relative",
    left: card.layoutMode === "absolute" && zone.absolute ? zone.absolute.x * scale : undefined,
    top: card.layoutMode === "absolute" && zone.absolute ? zone.absolute.y * scale : undefined,
    display: "flex",
    alignItems: zone.valign === "top" ? "flex-start" : zone.valign === "bottom" ? "flex-end" : "center",
    justifyContent: zone.align === "left" ? "flex-start" : zone.align === "right" ? "flex-end" : "center",
    width: zone.width ? zone.width * scale : undefined,
    minWidth: zone.minWidth ? zone.minWidth * scale : undefined,
    maxWidth: zone.maxWidth ? zone.maxWidth * scale : undefined,
    height: zone.height ? zone.height * scale : "100%",
    flexGrow: zone.grow,
    flexShrink: zone.grow ? 1 : 0,
    flexBasis: zone.grow && !zone.width ? 0 : undefined,
    paddingLeft: zone.paddingX * scale,
    paddingRight: zone.paddingX * scale,
    paddingTop: zone.paddingY * scale,
    paddingBottom: zone.paddingY * scale,
    marginLeft: (zone.marginX + zone.overlapLeft) * scale,
    marginRight: (zone.marginX + zone.overlapRight) * scale,
    zIndex: zone.z,
    background: surfaceBackground(zone.surface, ctx),
    border: borderCss(zone.border, ctx),
    borderRadius: borderRadiusFor(zone.shape, 0),
    clipPath: clipPathFor(zone.shape),
    overflow: "hidden",
  };

  return (
    <div style={style}>
      {decorations.map((d) => (
        <Decoration key={d.id} decoration={d} theme={theme} accent={row.accent} />
      ))}
      <ZoneContent zone={zone} row={row} theme={theme} scale={scale} />
    </div>
  );
}

function ZoneContent({
  zone,
  row,
  theme,
  scale,
}: {
  zone: CardZoneConfig;
  row: BroadcastRowData;
  theme: ThemeConfig;
  scale: number;
}) {
  const ctx = { theme, accent: row.accent };
  const text = typographyCss(zone.typography, ctx, scale);
  const truncate = zone.typography?.truncate ?? true;
  const base: CSSProperties = {
    ...text,
    width: "100%",
    whiteSpace: "nowrap",
    overflow: truncate ? "hidden" : "visible",
    textOverflow: truncate ? "ellipsis" : undefined,
  };

  const pad = (n: number | null) =>
    n == null ? (zone.emptyText ?? "") : zone.leadingZero && n < 10 ? `0${n}` : `${n}`;

  switch (zone.type) {
    case "rank":
      return <span className="numeric" style={base}>{pad(row.rank)}</span>;
    case "running-order":
      return <span className="numeric" style={base}>{pad(row.runningOrder)}</span>;
    case "country-name":
      return <span style={base}>{row.name}</span>;
    case "score":
      return <span className="numeric" style={base}>{row.score ?? zone.emptyText ?? "–"}</span>;
    case "jury-score":
      return <span className="numeric" style={base}>{row.juryScore ?? zone.emptyText ?? "–"}</span>;
    case "televote-score":
      return <span className="numeric" style={base}>{row.televoteScore ?? zone.emptyText ?? "–"}</span>;
    case "movement":
      return <Movement value={row.movement} style={base} theme={theme} />;
    case "qualification":
      return (
        <span style={base}>
          {row.qualified ? "Q" : row.eliminated ? "✕" : (zone.emptyText ?? "")}
        </span>
      );
    case "custom-text":
      return <span style={base}>{zone.text || row.subtitle || ""}</span>;
    case "flag":
      return row.flagImage ? (
        <img
          src={row.flagImage}
          alt={`Flag of ${row.name}`}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: zone.fit ?? "cover",
            objectPosition: zone.objectPosition ?? "center",
          }}
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center"
          style={{ ...base, background: withAlpha(row.accent, 0.9), color: "#08101f", textAlign: "center" }}
        >
          {row.abbreviation}
        </span>
      );
    case "image":
      return zone.imageUrl ? (
        <img src={zone.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: zone.fit ?? "contain" }} />
      ) : null;
    case "spacer":
    case "decoration":
    default:
      return null;
  }
}

function Movement({
  value,
  style,
  theme,
}: {
  value: number | null;
  style: CSSProperties;
  theme: ThemeConfig;
}) {
  if (value == null || value === 0)
    return <span style={{ ...style, opacity: 0.45 }}>–</span>;
  const up = value > 0;
  return (
    <span className="numeric" style={{ ...style, color: up ? theme.states.qualified : theme.colors.secondary }}>
      {up ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

/* ------------------------------------------------------------ decoration -- */

function Decoration({
  decoration: d,
  theme,
  accent,
}: {
  decoration: DecorationConfig;
  theme: ThemeConfig;
  accent: string;
}) {
  const ctx = { theme, accent };
  const c1 = resolveColor(d.color, ctx);
  const c2 = resolveColor(d.color2, ctx);
  const u = d.unit;

  let background: string | undefined;
  let backdropFilter: string | undefined;
  let boxShadow: string | undefined;

  switch (d.kind) {
    case "gradient":
    case "sweep":
      background = `linear-gradient(${d.angle}deg, ${withAlpha(c1, d.opacity)}, ${
        d.color2 === "transparent" ? "transparent" : withAlpha(c2, 0)
      })`;
      break;
    case "country-tint":
      background = withAlpha(accent, d.opacity);
      break;
    case "theme-tint":
      background = withAlpha(theme.colors.primary, d.opacity);
      break;
    case "image":
      background = d.imageUrl ? `center/cover no-repeat url(${d.imageUrl})` : undefined;
      break;
    case "pattern":
      background = `repeating-linear-gradient(${d.angle}deg, ${withAlpha(c1, d.opacity)} 0 6px, transparent 6px 14px)`;
      break;
    case "blur":
      backdropFilter = `blur(${Math.max(1, d.radius)}px)`;
      break;
    case "glow":
      boxShadow = `0 0 ${Math.max(8, d.radius)}px ${withAlpha(c1, d.opacity)}`;
      break;
    case "shadow":
      boxShadow = `inset 0 0 ${Math.max(8, d.radius)}px ${withAlpha(c1, d.opacity)}`;
      break;
    case "highlight-edge":
      boxShadow = `inset 0 1px 0 ${withAlpha(c1, d.opacity)}`;
      break;
    case "solid":
    case "stripe":
    case "accent-bar":
    case "mask":
    default:
      background = withAlpha(c1, d.opacity);
      break;
  }

  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: `${d.x}${u}`,
        top: `${d.y}${u}`,
        width: `${d.width}${u}`,
        height: `${d.height}${u}`,
        borderRadius: d.radius,
        clipPath: clipPathFor(d.shape),
        mixBlendMode: d.blend as CSSProperties["mixBlendMode"],
        pointerEvents: "none",
        zIndex: d.z,
        background,
        backdropFilter,
        boxShadow,
      }}
    />
  );
}
