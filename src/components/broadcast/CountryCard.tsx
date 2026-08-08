"use client";

/**
 * Country card renderer.
 *
 * Most presets use the universal zone engine.
 * SSC21 uses a dedicated composition because the historic design is a fixed
 * layered graphic: score rectangle -> diagonal fan -> rectangular flag ->
 * diagonal fan -> country rectangle. Trying to express that as flex zones
 * changes the proportions and creates gaps/rounded-looking joins.
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
  if (card.preset === "ssc21") {
    return (
      <SSC21CountryCard
        card={card}
        theme={theme}
        row={row}
        awarded={awarded}
        scale={scale}
        animate={animate}
        className={className}
      />
    );
  }

  return (
    <UniversalCountryCard
      card={card}
      theme={theme}
      row={row}
      awarded={awarded}
      scale={scale}
      animate={animate}
      className={className}
    />
  );
}

/* ========================================================================== */
/* SSC21                                                                      */
/* ========================================================================== */

function SSC21CountryCard({
  card,
  theme,
  row,
  awarded,
  scale,
  animate,
  className,
}: {
  card: CardTemplateConfig;
  theme: ThemeConfig;
  row: BroadcastRowData;
  awarded?: number | null;
  scale: number;
  animate: boolean;
  className?: string;
}) {
  const height = Math.max(32, card.height) * scale;

  const scoreZone = card.zones.find((zone) => zone.type === "score");
  const nameZone = card.zones.find((zone) => zone.type === "country-name");

  const scoreTypography =
    scoreZone?.typography ??
    ({
      family: "display",
      size: 17,
      minSize: 10,
      weight: 300,
      letterSpacing: 0,
      uppercase: false,
      color: "#d7d2df",
      align: "center",
      truncate: true,
    } as const);

  const nameTypography =
    nameZone?.typography ??
    ({
      family: "display",
      size: 16,
      minSize: 10,
      weight: 300,
      letterSpacing: 1.15,
      uppercase: true,
      color: "#c8c8c9",
      align: "left",
      truncate: true,
    } as const);

  const ctx = { theme, accent: row.accent };

  const Wrapper = animate
    ? motion.li
    : ("li" as unknown as typeof motion.li);

  return (
    <Wrapper
      layout={animate}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn("relative list-none", className)}
      style={{
        height,
        width: "100%",
        overflow: "visible",
        opacity: card.opacity,
      }}
    >
      {/* Long flat country bar. It starts underneath the diagonal fan. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          left: "30.5%",
          background:
            "linear-gradient(90deg, #16261f 0%, #111d17 52%, #0c1511 100%)",
          zIndex: 1,
        }}
      />

      {/* SCORE BOX — reference is much shorter than the previous version. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "13.2%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#13072b",
          zIndex: 2,
          overflow: "hidden",
        }}
      >
        <span
          className="numeric"
          style={{
            ...typographyCss(scoreTypography, ctx, scale),
            width: "100%",
            textAlign: "center",
            fontWeight: 300,
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {row.score ?? scoreZone?.emptyText ?? "–"}
        </span>
      </div>

      {/* FLAG sits UNDER the diagonal pieces. */}
      <div
        style={{
          position: "absolute",
          left: "23.2%",
          top: 0,
          bottom: 0,
          width: "9.4%",
          zIndex: 3,
          overflow: "hidden",
          background: row.accent,
        }}
      >
        {row.flagImage ? (
          <img
            src={row.flagImage}
            alt={`Flag of ${row.name}`}
            loading="lazy"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center",
            }}
          />
        ) : (
          <span
            style={{
              display: "grid",
              width: "100%",
              height: "100%",
              placeItems: "center",
              color: "#08101f",
              fontWeight: 800,
              fontSize: 11 * scale,
            }}
          >
            {row.abbreviation}
          </span>
        )}
      </div>

      {/* LEFT FAN — much thinner, beginning right at the score box. */}
      <SSC21Band left="12.3%" width="5.2%" color="#17113f" z={6} slant={28} />
      <SSC21Band left="15.2%" width="5.0%" color="#142b66" z={7} slant={28} />
      <SSC21Band left="18.0%" width="4.9%" color="#0b5167" z={8} slant={28} />
      <SSC21Band left="20.8%" width="4.5%" color="#08606a" z={9} slant={28} />

      {/* RIGHT FAN — compact and layered over the flag edge. */}
      <SSC21Band left="29.2%" width="4.5%" color="#086158" z={9} slant={28} />
      <SSC21Band left="31.8%" width="4.7%" color="#0e5147" z={8} slant={28} />
      <SSC21Band left="34.5%" width="4.8%" color="#164137" z={7} slant={28} />
      <SSC21Band left="37.3%" width="4.5%" color="#17342c" z={6} slant={28} />

      {/* Country text starts after the fan, matching the reference spacing. */}
      <div
        style={{
          position: "absolute",
          left: "39.2%",
          right: 0,
          top: 0,
          bottom: 0,
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          paddingLeft: 11 * scale,
          paddingRight: 10 * scale,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            ...typographyCss(nameTypography, ctx, scale),
            width: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 300,
            lineHeight: 1,
          }}
        >
          {row.name}
        </span>
      </div>

      {/* Thin row separation only. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -1 * scale,
          height: Math.max(1, 1.05 * scale),
          background: "rgba(0,0,0,.26)",
          zIndex: 20,
          pointerEvents: "none",
        }}
      />

      {awarded != null && awarded !== 0 && (
        <motion.span
          key={`award-${awarded}`}
          initial={{ scale: 0.6, opacity: 0, x: 14 }}
          animate={{ scale: 1, opacity: 1, x: 0 }}
          className="numeric"
          style={{
            position: "absolute",
            right: -44 * scale,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 30,
            fontSize: 13 * scale,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          +{awarded}
        </motion.span>
      )}
    </Wrapper>
  );
}

function SSC21Band({
  left,
  width,
  color,
  z,
  slant,
}: {
  left: string;
  width: string;
  color: string;
  z: number;
  slant: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left,
        top: 0,
        bottom: 0,
        width,
        zIndex: z,
        background: color,
        clipPath: `polygon(${slant}% 0, 100% 0, ${100 - slant}% 100%, 0 100%)`,
        pointerEvents: "none",
      }}
    />
  );
}

/* ========================================================================== */
/* UNIVERSAL ZONE CARD                                                        */
/* ========================================================================== */

function UniversalCountryCard({
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

  const override =
    states.reduce<
      Partial<
        NonNullable<CardTemplateConfig["stateOverrides"]["leader"]>
      >
    >(
      (acc, state) =>
        Object.keys(acc).length
          ? acc
          : (card.stateOverrides?.[state] ?? {}),
      {},
    );

  const background = surfaceBackground(
    override.background ?? card.background,
    ctx,
  );

  const cardBorder = borderCss(
    override.border ?? card.border,
    ctx,
  );

  const shadows = [
    shadowCss(override.shadow ?? card.shadow, ctx),
    shadowCss(card.glow, ctx),
  ]
    .filter(Boolean)
    .join(", ");

  const style: CSSProperties = {
    position: "relative",
    display: card.layoutMode === "grid" ? "grid" : "flex",
    gridTemplateColumns:
      card.layoutMode === "grid" ? card.gridTemplate : undefined,
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
    color: resolveColor(
      override.textColor ?? "theme:text",
      ctx,
    ),
    backdropFilter: card.background.blur
      ? `blur(${card.background.blur}px)`
      : undefined,
  };

  const zones = sortedZones(card.zones).filter(
    (zone) => zone.visible,
  );

  const cardDecorations = (card.decorations ?? []).filter(
    (decoration) =>
      decoration.visible && decoration.target === "card",
  );

  const Wrapper = animate
    ? motion.li
    : ("li" as unknown as typeof motion.li);

  return (
    <Wrapper
      layout={animate}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn("list-none", className)}
      style={style}
    >
      {cardDecorations.map((decoration) => (
        <Decoration
          key={decoration.id}
          decoration={decoration}
          theme={theme}
          accent={row.accent}
        />
      ))}

      {zones.map((zone) => (
        <Zone
          key={zone.id}
          zone={zone}
          card={card}
          row={row}
          theme={theme}
          scale={scale}
          decorations={(card.decorations ?? []).filter(
            (decoration) =>
              decoration.visible &&
              decoration.target === zone.id,
          )}
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
    position:
      card.layoutMode === "absolute" && zone.absolute
        ? "absolute"
        : "relative",
    left:
      card.layoutMode === "absolute" && zone.absolute
        ? zone.absolute.x * scale
        : undefined,
    top:
      card.layoutMode === "absolute" && zone.absolute
        ? zone.absolute.y * scale
        : undefined,
    display: "flex",
    alignItems:
      zone.valign === "top"
        ? "flex-start"
        : zone.valign === "bottom"
          ? "flex-end"
          : "center",
    justifyContent:
      zone.align === "left"
        ? "flex-start"
        : zone.align === "right"
          ? "flex-end"
          : "center",
    width: zone.width ? zone.width * scale : undefined,
    minWidth: zone.minWidth
      ? zone.minWidth * scale
      : undefined,
    maxWidth: zone.maxWidth
      ? zone.maxWidth * scale
      : undefined,
    height: zone.height ? zone.height * scale : "100%",
    flexGrow: zone.grow,
    flexShrink: zone.grow ? 1 : 0,
    flexBasis:
      zone.grow && !zone.width ? 0 : undefined,
    paddingLeft: zone.paddingX * scale,
    paddingRight: zone.paddingX * scale,
    paddingTop: zone.paddingY * scale,
    paddingBottom: zone.paddingY * scale,
    marginLeft:
      (zone.marginX + zone.overlapLeft) * scale,
    marginRight:
      (zone.marginX + zone.overlapRight) * scale,
    zIndex: zone.z,
    background: surfaceBackground(zone.surface, ctx),
    border: borderCss(zone.border, ctx),
    borderRadius: borderRadiusFor(zone.shape, 0),
    clipPath: clipPathFor(zone.shape),
    overflow: "hidden",
  };

  return (
    <div style={style}>
      {decorations.map((decoration) => (
        <Decoration
          key={decoration.id}
          decoration={decoration}
          theme={theme}
          accent={row.accent}
        />
      ))}

      <ZoneContent
        zone={zone}
        row={row}
        theme={theme}
        scale={scale}
      />
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

  const pad = (value: number | null) =>
    value == null
      ? (zone.emptyText ?? "")
      : zone.leadingZero && value < 10
        ? `0${value}`
        : `${value}`;

  switch (zone.type) {
    case "rank":
      return (
        <span className="numeric" style={base}>
          {pad(row.rank)}
        </span>
      );

    case "running-order":
      return (
        <span className="numeric" style={base}>
          {pad(row.runningOrder)}
        </span>
      );

    case "country-name":
      return <span style={base}>{row.name}</span>;

    case "score":
      return (
        <span className="numeric" style={base}>
          {row.score ?? zone.emptyText ?? "–"}
        </span>
      );

    case "jury-score":
      return (
        <span className="numeric" style={base}>
          {row.juryScore ?? zone.emptyText ?? "–"}
        </span>
      );

    case "televote-score":
      return (
        <span className="numeric" style={base}>
          {row.televoteScore ?? zone.emptyText ?? "–"}
        </span>
      );

    case "movement":
      return (
        <Movement
          value={row.movement}
          style={base}
          theme={theme}
        />
      );

    case "qualification":
      return (
        <span style={base}>
          {row.qualified
            ? "Q"
            : row.eliminated
              ? "✕"
              : (zone.emptyText ?? "")}
        </span>
      );

    case "custom-text":
      return (
        <span style={base}>
          {zone.text || row.subtitle || ""}
        </span>
      );

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
            objectPosition:
              zone.objectPosition ?? "center",
          }}
        />
      ) : (
        <span
          className="grid h-full w-full place-items-center"
          style={{
            ...base,
            background: withAlpha(row.accent, 0.9),
            color: "#08101f",
            textAlign: "center",
          }}
        >
          {row.abbreviation}
        </span>
      );

    case "image":
      return zone.imageUrl ? (
        <img
          src={zone.imageUrl}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: zone.fit ?? "contain",
          }}
        />
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
  if (value == null || value === 0) {
    return (
      <span style={{ ...style, opacity: 0.45 }}>–</span>
    );
  }

  const up = value > 0;

  return (
    <span
      className="numeric"
      style={{
        ...style,
        color: up
          ? theme.states.qualified
          : theme.colors.secondary,
      }}
    >
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
  const unit = d.unit;

  let background: string | undefined;
  let backdropFilter: string | undefined;
  let boxShadow: string | undefined;

  switch (d.kind) {
    case "gradient":
    case "sweep":
      background = `linear-gradient(${d.angle}deg, ${withAlpha(
        c1,
        d.opacity,
      )}, ${
        d.color2 === "transparent"
          ? "transparent"
          : withAlpha(c2, 0)
      })`;
      break;

    case "country-tint":
      background = withAlpha(accent, d.opacity);
      break;

    case "theme-tint":
      background = withAlpha(
        theme.colors.primary,
        d.opacity,
      );
      break;

    case "image":
      background = d.imageUrl
        ? `center/cover no-repeat url(${d.imageUrl})`
        : undefined;
      break;

    case "pattern":
      background = `repeating-linear-gradient(${d.angle}deg, ${withAlpha(
        c1,
        d.opacity,
      )} 0 6px, transparent 6px 14px)`;
      break;

    case "blur":
      backdropFilter = `blur(${Math.max(
        1,
        d.radius,
      )}px)`;
      break;

    case "glow":
      boxShadow = `0 0 ${Math.max(
        8,
        d.radius,
      )}px ${withAlpha(c1, d.opacity)}`;
      break;

    case "shadow":
      boxShadow = `inset 0 0 ${Math.max(
        8,
        d.radius,
      )}px ${withAlpha(c1, d.opacity)}`;
      break;

    case "highlight-edge":
      boxShadow = `inset 0 1px 0 ${withAlpha(
        c1,
        d.opacity,
      )}`;
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
        left: `${d.x}${unit}`,
        top: `${d.y}${unit}`,
        width: `${d.width}${unit}`,
        height: `${d.height}${unit}`,
        borderRadius: d.radius,
        clipPath: clipPathFor(d.shape),
        mixBlendMode:
          d.blend as CSSProperties["mixBlendMode"],
        pointerEvents: "none",
        zIndex: d.z,
        background,
        backdropFilter,
        boxShadow,
      }}
    />
  );
}
