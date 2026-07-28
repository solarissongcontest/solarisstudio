"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Country, Participant } from "@/lib/data";
import type { Standing } from "@/lib/analysis";
import { flagStyle, themeVars, type ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Theme-driven scoreboard. Every visual property (card shape, flag shape,
 * colours, density, columns) comes from the show's ThemeConfig.
 */
export function ScoreboardStage({
  theme,
  standings,
  countries,
  participants,
  awarded,
  highlight,
  qualifiers,
  className,
  compact,
}: {
  theme: ThemeConfig;
  standings: Standing[];
  countries: Map<string, Country>;
  participants?: Map<string, Participant>;
  awarded?: Record<string, number>;
  highlight?: string | null;
  qualifiers?: number | null;
  className?: string;
  compact?: boolean;
}) {
  const rows = standings.slice(0, theme.layout.maxVisible || standings.length);
  const columns = theme.layout.mode === "two-column" ? 2 : theme.layout.mode === "grid" ? 3 : 1;
  const topAward = Math.max(0, ...Object.values(awarded ?? {}));

  return (
    <div
      style={themeVars(theme)}
      className={cn(
        "grid",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: columns }).map((_, col) => {
        const per = Math.ceil(rows.length / columns);
        const slice = rows.slice(col * per, (col + 1) * per);
        return (
          <ol key={col} style={{ display: "grid", gap: `var(--t-gap)`, alignContent: "start" }}>
            {slice.map((row) => {
              const c = countries.get(row.countryId);
              if (!c) return null;
              const p = participants?.get(row.countryId);
              const gain = awarded?.[row.countryId];
              const isTop = !!gain && gain === topAward && topAward > 0;
              const qualified = qualifiers ? row.rank <= qualifiers : false;
              const accent = theme.card.useCountryColor ? c.accent_color : theme.colors.primary;
              return (
                <motion.li
                  key={row.countryId}
                  layout
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  className="relative flex items-center overflow-hidden"
                  style={{
                    minHeight: compact ? theme.card.height * 0.78 : theme.card.height,
                    borderRadius: "var(--t-radius)",
                    gap: 12,
                    paddingLeft: 12,
                    paddingRight: 12,
                    background: gain
                      ? `linear-gradient(90deg, ${hexA(accent, 0.55)}, ${hexA(accent, theme.card.opacity + 0.12)})`
                      : hexA(theme.colors.text, theme.card.opacity),
                    border: `${theme.card.borderWidth}px solid ${
                      highlight === row.countryId
                        ? theme.colors.primary
                        : row.rank === 1
                          ? hexA(theme.colors.gold, 0.6)
                          : hexA(theme.colors.text, 0.16)
                    }`,
                    backdropFilter: `blur(${theme.card.blur}px)`,
                    boxShadow: theme.card.shadow ? `0 12px 30px -18px rgba(0,0,0,0.9)` : undefined,
                  }}
                >
                  {theme.layout.showRank && (
                    <span
                      className="numeric w-7 shrink-0 text-center text-sm font-bold"
                      style={{ color: row.rank === 1 ? theme.colors.gold : hexA(theme.colors.text, 0.6) }}
                    >
                      {row.rank}
                    </span>
                  )}

                  {c.flag_image ? (
                    <img src={c.flag_image} alt={`Flag of ${c.name}`} style={flagStyle(theme)} loading="lazy" />
                  ) : (
                    <span
                      style={{
                        ...flagStyle(theme),
                        background: accent,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {c.short_code}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate font-semibold"
                      style={{ fontFamily: "var(--t-font-display)", fontSize: compact ? 13 : 15 }}
                    >
                      {c.name}
                    </span>
                    {theme.layout.showArtist && p && (p.artist || p.song) && (
                      <span className="block truncate text-[11px]" style={{ opacity: 0.62 }}>
                        {[p.artist, p.song].filter(Boolean).join(" — ")}
                      </span>
                    )}
                  </span>

                  {theme.layout.showSplit && !compact && (
                    <span className="hidden shrink-0 gap-1.5 text-[10px] sm:flex">
                      <span
                        className="numeric rounded px-1.5 py-0.5"
                        style={{ background: hexA(theme.colors.jury, 0.18), color: theme.colors.jury }}
                      >
                        J {row.jury}
                      </span>
                      <span
                        className="numeric rounded px-1.5 py-0.5"
                        style={{ background: hexA(theme.colors.televote, 0.18), color: theme.colors.televote }}
                      >
                        T {row.televote}
                      </span>
                    </span>
                  )}

                  {qualified && (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ background: hexA(theme.colors.gold, 0.2), color: theme.colors.gold }}
                    >
                      Q
                    </span>
                  )}

                  <AnimatePresence>
                    {gain ? (
                      <motion.span
                        key={`g-${gain}`}
                        initial={{ scale: isTop ? 0.2 : 0.7, opacity: 0, x: 18 }}
                        animate={{ scale: 1, opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 430, damping: 18 }}
                        className="numeric grid shrink-0 place-items-center rounded-lg px-2 py-1 font-bold"
                        style={{
                          minWidth: isTop ? 52 : 38,
                          fontSize: isTop ? 18 : 14,
                          background: isTop
                            ? `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`
                            : hexA(theme.colors.text, 0.16),
                          color: isTop ? "#08101f" : theme.colors.text,
                          boxShadow: isTop ? `0 0 34px -4px ${theme.colors.primary}` : undefined,
                        }}
                      >
                        +{gain}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>

                  <motion.span
                    layout
                    className="numeric shrink-0 text-right font-bold"
                    style={{ width: 56, fontSize: compact ? 15 : 19 }}
                  >
                    {row.total}
                  </motion.span>
                </motion.li>
              );
            })}
          </ol>
        );
      })}
    </div>
  );
}

/** Hex (#rgb/#rrggbb) → rgba() string. Falls back to the raw value. */
export function hexA(hex: string, alpha: number) {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((x) => x + x)
      .join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
