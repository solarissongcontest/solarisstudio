"use client";

/**
 * Board renderer: canvas, background, header, columns of country cards,
 * side panel, footer and logo — all driven by `ScoreboardConfig`.
 */

import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { CountryCard } from "./CountryCard";
import {
  distributeRows,
  resolveColor,
  shadowCss,
  surfaceBackground,
  typographyCss,
  withAlpha,
  type BroadcastRowData,
  type ScoreboardConfig,
} from "@/lib/scoreboard";
import { backgroundStyle, themeVars, type ThemeConfig } from "@/lib/theme";

export function ScoreboardBoard({
  config,
  theme,
  rows,
  awarded,
  title,
  subtitle,
  progress,
  panelContent,
  overlay,
  scale = 1,
  animate = true,
}: {
  config: ScoreboardConfig;
  theme: ThemeConfig;
  rows: BroadcastRowData[];
  awarded?: Record<string, number>;
  title?: string;
  subtitle?: string;
  progress?: number;
  panelContent?: ReactNode;
  overlay?: ReactNode;
  scale?: number;
  animate?: boolean;
}) {
  const ctx = { theme };
  const {
    layout,
    card,
    header,
    footer,
    logo,
    background,
    panel,
    canvas,
  } = config;

  const columns = distributeRows(
    rows,
    layout.columns,
    layout.distribution,
    layout.rowsPerColumn,
  );

  const bg: CSSProperties =
    background.type === "theme"
      ? backgroundStyle(theme)
      : background.type === "transparent"
        ? { background: "transparent" }
        : background.type === "color"
          ? { background: resolveColor(background.color, ctx) }
          : background.type === "image" && background.imageUrl
            ? {
                background: `center/cover no-repeat url(${background.imageUrl})`,
              }
            : {
                background: `linear-gradient(${background.gradientAngle}deg, ${resolveColor(
                  background.gradientFrom,
                  ctx,
                )}, ${resolveColor(background.gradientTo, ctx)})`,
              };

  const boardBlock = (
    <div
      style={{
        width: layout.boardWidth * scale,
        maxWidth: "100%",
        height: layout.boardHeight
          ? layout.boardHeight * scale
          : undefined,
        transform: `translate(${layout.positionX * scale}px, ${
          layout.positionY * scale
        }px)`,
        display: "grid",
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gap: layout.columnGap * scale,
        alignContent:
          layout.verticalAlignment === "center"
            ? "center"
            : layout.verticalAlignment === "bottom"
              ? "end"
              : "start",
      }}
    >
      {columns.map((col, ci) => (
        <div key={ci} style={{ display: "grid", gap: 6 }}>
          {layout.columnHeadings[ci] && (
            <p
              style={{
                ...typographyCss(
                  layout.columnHeadingTypography,
                  ctx,
                  scale,
                ),
                margin: 0,
              }}
            >
              {layout.columnHeadings[ci]}
            </p>
          )}

          <ul
            style={{
              display: "grid",
              gap: layout.rowGap * scale,
              margin: 0,
              padding: 0,
              alignContent: "start",
            }}
          >
            <AnimatePresence initial={false}>
              {col.map((row) => (
                <CountryCard
                  key={row.id}
                  card={card}
                  theme={theme}
                  row={row}
                  awarded={awarded?.[row.id] ?? null}
                  scale={scale}
                  animate={animate && config.animation.enabled}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ))}
    </div>
  );

  /**
   * Prefer a scoreboard-specific logo URL when one exists.
   * Otherwise use the show's theme logo. This is especially useful for
   * SSC21, whose original composition has a large contest logo below the rows.
   */
  const resolvedLogoUrl = logo.url ?? theme.logoUrl;

  const logoBlock = logo.visible && resolvedLogoUrl && (
    <img
      src={resolvedLogoUrl}
      alt="Contest logo"
      style={{
        width: logo.width * scale,
        maxHeight: logo.maxHeight * scale,
        objectFit: "contain",
        opacity: logo.opacity,
        marginTop: logo.marginTop * scale,
        filter: logo.shadow.enabled
          ? `drop-shadow(${shadowCss(logo.shadow, ctx)})`
          : undefined,
        alignSelf:
          logo.align === "left"
            ? "flex-start"
            : logo.align === "right"
              ? "flex-end"
              : "center",
      }}
    />
  );

  const panelBlock = panel.visible && (
    <aside
      style={{
        width:
          panel.side === "left" || panel.side === "right"
            ? panel.size * scale
            : undefined,
        height:
          panel.side === "top" || panel.side === "bottom"
            ? panel.size * scale
            : undefined,
        background: surfaceBackground(panel.surface, ctx),
        borderRadius: panel.radius * scale,
        padding: panel.padding * scale,
        color: theme.chrome.panelText,
        flexShrink: 0,
      }}
    >
      {panel.label && (
        <p
          className="mb-2 text-[11px] uppercase tracking-widest"
          style={{ opacity: 0.7 }}
        >
          {panel.label}
        </p>
      )}

      {panel.content === "image" && panel.imageUrl ? (
        <img
          src={panel.imageUrl}
          alt=""
          className="w-full rounded-lg object-cover"
        />
      ) : (
        panelContent
      )}
    </aside>
  );

  const isRow =
    panel.visible &&
    (panel.side === "left" || panel.side === "right");

  return (
    <div
      style={{
        ...bg,
        ...themeVars(theme),
        position: "relative",
        minHeight: "100%",
        fontFamily: "var(--t-font-body)",
        color: theme.colors.text,
        filter: background.blur
          ? `blur(${background.blur}px)`
          : undefined,
      }}
    >
      {background.overlay > 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: `rgba(0,0,0,${background.overlay})`,
          }}
        />
      )}

      {background.vignette > 0 && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 45%, transparent 45%, rgba(0,0,0,${background.vignette}) 100%)`,
          }}
        />
      )}

      {background.pattern !== "none" && (
        <div
          className="absolute inset-0"
          style={{
            opacity: background.patternOpacity,
            backgroundImage:
              background.pattern === "grid"
                ? "linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px)"
                : background.pattern === "bands"
                  ? "repeating-linear-gradient(115deg, rgba(255,255,255,.12) 0 10px, transparent 10px 34px)"
                  : "repeating-conic-gradient(from 30deg, rgba(255,255,255,.1) 0 15deg, transparent 15deg 30deg)",
            backgroundSize:
              background.pattern === "grid"
                ? "48px 48px"
                : undefined,
          }}
        />
      )}

      <div
        style={{
          position: "relative",
          paddingTop: layout.safeMarginTop * scale,
          paddingRight: layout.safeMarginRight * scale,
          paddingBottom: layout.safeMarginBottom * scale,
          paddingLeft: layout.safeMarginLeft * scale,
          display: "flex",
          flexDirection: "column",
          alignItems:
            layout.alignment === "left"
              ? "flex-start"
              : layout.alignment === "right"
                ? "flex-end"
                : "center",
          gap: 0,
          minHeight: "100%",
        }}
      >
        {canvas.showSafeZones && (
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: `${layout.safeMarginTop * scale}px ${
                layout.safeMarginRight * scale
              }px ${layout.safeMarginBottom * scale}px ${
                layout.safeMarginLeft * scale
              }px`,
              border: "1px dashed rgba(255,255,255,.35)",
            }}
          />
        )}

        {header.visible && (
          <div
            style={{
              textAlign: header.align,
              marginBottom: header.marginBottom * scale,
              width: "100%",
              maxWidth: layout.boardWidth * scale,
            }}
          >
            {header.upper.visible && (
              <p
                style={{
                  ...typographyCss(
                    header.upper.typography,
                    ctx,
                    scale,
                  ),
                  margin: 0,
                  transform: `translateY(${header.upper.offsetY}px)`,
                }}
              >
                {header.upper.text}
              </p>
            )}

            {header.main.visible && (
              <h2
                style={{
                  ...typographyCss(
                    header.main.typography,
                    ctx,
                    scale,
                  ),
                  margin: `${header.lineSpacing * scale}px 0 0`,
                  textShadow: header.main.shadow.enabled
                    ? shadowCss(header.main.shadow, ctx)
                    : undefined,
                }}
              >
                {header.main.text || title || ""}
              </h2>
            )}

            {subtitle && (
              <p
                className="mt-1 text-xs opacity-70"
                style={{ margin: 0 }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: isRow
              ? panel.side === "left"
                ? "row-reverse"
                : "row"
              : "column",
            gap: 20 * scale,
            width: "100%",
            justifyContent:
              layout.alignment === "left"
                ? "flex-start"
                : layout.alignment === "right"
                  ? "flex-end"
                  : "center",
          }}
        >
          {boardBlock}
          {panelBlock}
        </div>

        {logo.position === "below-board" && logoBlock}

        {footer.visible && (
          <p
            style={{
              ...typographyCss(footer.typography, ctx, scale),
              marginTop: footer.marginTop * scale,
            }}
          >
            {footer.text}
            {footer.progressText && progress != null
              ? ` · ${Math.round(progress * 100)}%`
              : ""}
          </p>
        )}

        {progress != null && card.preset !== "ssc21" && (
          <div
            className="mt-3 h-1 w-full overflow-hidden rounded-full"
            style={{
              maxWidth: layout.boardWidth * scale,
              background: withAlpha(theme.colors.text, 0.15),
            }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, progress * 100)}%`,
                background: theme.colors.primary,
              }}
            />
          </div>
        )}

        {overlay}
      </div>
    </div>
  );
}
