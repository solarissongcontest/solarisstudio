"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import type {
  Country,
  Participant,
} from "@/lib/data";

import type {
  Standing,
} from "@/lib/analysis";

import {
  cardBackground,
  flagStyle,
  themeVars,
  type ThemeConfig,
} from "@/lib/theme";

import {
  cn,
} from "@/lib/utils";

/**
 * Theme-driven scoreboard.
 *
 * The edition owns the visual identity, but the number of columns is
 * resolved from the CURRENT SHOW'S row count.
 *
 * This means the same edition can naturally render:
 *   1–14 entries  -> 1 column
 *   15–30 entries -> 2 columns
 *   31+ entries   -> 3 columns
 *
 * No show needs its own visual theme just because it has a different
 * number of participants.
 */
export function ScoreboardStage({
  theme,
  standings,
  countries,
  participants,
  awarded,
  highlight,
  votingCountryId,
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

  /** Country currently casting jury votes. */
  votingCountryId?: string | null;

  qualifiers?: number | null;
  className?: string;
  compact?: boolean;
}) {
  const rows =
    standings.slice(
      0,
      theme.layout.maxVisible ||
        standings.length,
    );

  const columns =
    resolveShowColumns(
      rows.length,
      theme,
    );

  const topAward =
    Math.max(
      0,
      ...Object.values(
        awarded ?? {},
      ),
    );

  return (
    <div
      style={
        themeVars(
          theme,
        )
      }
      className={cn(
        "grid",
        columns === 2 &&
          "sm:grid-cols-2",
        columns === 3 &&
          "sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {Array.from({
        length:
          columns,
      }).map(
        (
          _,
          column,
        ) => {
          const per =
            Math.ceil(
              rows.length /
                columns,
            );

          const slice =
            rows.slice(
              column * per,
              (column + 1) *
                per,
            );

          return (
            <ol
              key={
                column
              }
              style={{
                display:
                  "grid",

                gap:
                  "var(--t-gap)",

                alignContent:
                  "start",
              }}
            >
              {slice.map(
                (row) => {
                  const country =
                    countries.get(
                      row.countryId,
                    );

                  if (
                    !country
                  ) {
                    return null;
                  }

                  const participant =
                    participants?.get(
                      row.countryId,
                    );

                  const gain =
                    awarded?.[
                      row.countryId
                    ];

                  const isTop =
                    !!gain &&
                    gain ===
                      topAward &&
                    topAward >
                      0;

                  const qualified =
                    qualifiers
                      ? row.rank <=
                        qualifiers
                      : false;

                  const accent =
                    theme.card
                      .useCountryColor
                      ? country.accent_color
                      : theme
                          .colors
                          .primary;

                  const isLeader =
                    row.rank ===
                    1;

                  const isVoting =
                    votingCountryId ===
                    row.countryId;

                  const isHighlighted =
                    highlight ===
                    row.countryId;

                  const background =
                    isVoting
                      ? theme
                          .states
                          .votingBackground
                      : isLeader
                        ? theme
                            .states
                            .leaderBackground
                        : gain
                          ? `linear-gradient(90deg, ${hexA(
                              accent,
                              0.55,
                            )}, ${hexA(
                              accent,
                              theme
                                .card
                                .opacity +
                                0.12,
                            )})`
                          : cardBackground(
                              theme,
                              accent,
                              hexA,
                            );

                  const borderColor =
                    isHighlighted
                      ? theme
                          .states
                          .highlight
                      : isLeader
                        ? theme
                            .states
                            .leaderBorder
                        : theme
                            .card
                            .borderColor;

                  const nameColor =
                    isVoting
                      ? theme
                          .states
                          .votingText
                      : isLeader
                        ? theme
                            .states
                            .leaderText
                        : theme
                            .text
                            .countryName;

                  const scoreColor =
                    isVoting
                      ? theme
                          .states
                          .votingText
                      : isLeader
                        ? theme
                            .states
                            .leaderText
                        : theme
                            .text
                            .countryScore;

                  return (
                    <motion.li
                      key={
                        row.countryId
                      }
                      layout
                      transition={{
                        type:
                          "spring",

                        stiffness:
                          400,

                        damping:
                          34,
                      }}
                      className="relative flex items-center overflow-hidden"
                      style={{
                        minHeight:
                          compact
                            ? theme
                                .card
                                .height *
                              0.78
                            : theme
                                .card
                                .height,

                        borderRadius:
                          "var(--t-radius)",

                        gap: 12,

                        paddingLeft:
                          theme
                            .card
                            .padding,

                        paddingRight:
                          theme
                            .card
                            .padding,

                        background,

                        border:
                          `${theme.card.borderWidth}px solid ${borderColor}`,

                        backdropFilter:
                          `blur(${theme.card.blur}px)`,

                        boxShadow:
                          theme.card
                            .shadow
                            ? `0 12px 30px -18px ${hexA(
                                theme
                                  .card
                                  .shadowColor,
                                theme
                                  .card
                                  .shadowStrength,
                              )}`
                            : undefined,
                      }}
                    >
                      {theme
                        .layout
                        .showRank && (
                        <span
                          className="numeric w-7 shrink-0 text-center text-sm font-bold"
                          style={{
                            color:
                              row.rank ===
                              1
                                ? theme
                                    .colors
                                    .gold
                                : hexA(
                                    theme
                                      .text
                                      .rank,
                                    0.6,
                                  ),
                          }}
                        >
                          {
                            row.rank
                          }
                        </span>
                      )}

                      {country.flag_image ? (
                        <img
                          src={
                            country.flag_image
                          }
                          alt={`Flag of ${country.name}`}
                          style={
                            flagStyle(
                              theme,
                            )
                          }
                          loading="lazy"
                        />
                      ) : (
                        <span
                          style={{
                            ...flagStyle(
                              theme,
                            ),

                            background:
                              accent,

                            display:
                              "grid",

                            placeItems:
                              "center",

                            fontSize:
                              10,

                            fontWeight:
                              700,
                          }}
                        >
                          {
                            country.short_code
                          }
                        </span>
                      )}

                      <span className="min-w-0 flex-1">
                        <span
                          className="block truncate font-semibold"
                          style={{
                            fontFamily:
                              "var(--t-font-display)",

                            fontSize:
                              compact
                                ? 13
                                : 15,

                            color:
                              nameColor,
                          }}
                        >
                          {
                            country.name
                          }
                        </span>

                        {theme
                          .layout
                          .showArtist &&
                          participant &&
                          (participant.artist ||
                            participant.song) && (
                            <span
                              className="block truncate text-[11px]"
                              style={{
                                color:
                                  theme
                                    .text
                                    .artistSong,

                                opacity:
                                  0.62,
                              }}
                            >
                              {[
                                participant.artist,
                                participant.song,
                              ]
                                .filter(
                                  Boolean,
                                )
                                .join(
                                  " — ",
                                )}
                            </span>
                          )}
                      </span>

                      {theme
                        .layout
                        .showSplit &&
                        !compact && (
                          <span className="hidden shrink-0 gap-1.5 text-[10px] sm:flex">
                            <span
                              className="numeric rounded px-1.5 py-0.5"
                              style={{
                                background:
                                  hexA(
                                    theme
                                      .colors
                                      .jury,
                                    0.18,
                                  ),

                                color:
                                  theme
                                    .colors
                                    .jury,
                              }}
                            >
                              J{" "}
                              {
                                row.jury
                              }
                            </span>

                            <span
                              className="numeric rounded px-1.5 py-0.5"
                              style={{
                                background:
                                  hexA(
                                    theme
                                      .colors
                                      .televote,
                                    0.18,
                                  ),

                                color:
                                  theme
                                    .colors
                                    .televote,
                              }}
                            >
                              T{" "}
                              {
                                row.televote
                              }
                            </span>
                          </span>
                        )}

                      {qualified && (
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{
                            background:
                              hexA(
                                theme
                                  .states
                                  .qualified,
                                0.2,
                              ),

                            color:
                              theme
                                .states
                                .qualified,
                          }}
                        >
                          Q
                        </span>
                      )}

                      <AnimatePresence>
                        {gain ? (
                          <motion.span
                            key={`g-${gain}`}
                            initial={{
                              scale:
                                isTop
                                  ? 0.2
                                  : 0.7,

                              opacity:
                                0,

                              x: 18,
                            }}
                            animate={{
                              scale:
                                1,

                              opacity:
                                1,

                              x: 0,
                            }}
                            exit={{
                              opacity:
                                0,

                              scale:
                                0.8,
                            }}
                            transition={{
                              type:
                                "spring",

                              stiffness:
                                430,

                              damping:
                                18,
                            }}
                            className="numeric grid shrink-0 place-items-center rounded-lg px-2 py-1 font-bold"
                            style={{
                              minWidth:
                                isTop
                                  ? 52
                                  : 38,

                              fontSize:
                                isTop
                                  ? 18
                                  : 14,

                              background:
                                isTop
                                  ? `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`
                                  : hexA(
                                      theme
                                        .text
                                        .countryScore,
                                      0.16,
                                    ),

                              color:
                                isTop
                                  ? "#08101f"
                                  : theme
                                      .text
                                      .countryScore,

                              boxShadow:
                                isTop
                                  ? `0 0 34px -4px ${theme.colors.primary}`
                                  : undefined,
                            }}
                          >
                            +
                            {
                              gain
                            }
                          </motion.span>
                        ) : null}
                      </AnimatePresence>

                      <motion.span
                        layout
                        className="numeric shrink-0 text-right font-bold"
                        style={{
                          width:
                            56,

                          fontSize:
                            compact
                              ? 15
                              : 19,

                          color:
                            scoreColor,
                        }}
                      >
                        {
                          row.total
                        }
                      </motion.span>
                    </motion.li>
                  );
                },
              )}
            </ol>
          );
        },
      )}
    </div>
  );
}

/**
 * Automatic show-aware layout.
 *
 * We intentionally do not let a saved edition style force a tiny show
 * into multiple columns. Likewise, a 26-country final should not be
 * trapped in one enormous vertical list.
 *
 * `grid` is allowed to expand to 3 columns for very large shows.
 * Other theme modes top out at 2.
 */
export function resolveShowColumns(
  rowCount: number,
  theme: ThemeConfig,
): 1 | 2 | 3 {
  if (
    rowCount <=
    14
  ) {
    return 1;
  }

  if (
    rowCount <=
    30
  ) {
    return 2;
  }

  return theme.layout.mode ===
    "grid"
    ? 3
    : 2;
}

/** Hex (#rgb/#rrggbb) → rgba() string. Falls back to the raw value. */
export function hexA(
  hex: string,
  alpha: number,
) {
  const match =
    /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(
      hex.trim(),
    );

  if (
    !match
  ) {
    return hex;
  }

  let value =
    match[1];

  if (
    value.length ===
    3
  ) {
    value =
      value
        .split("")
        .map(
          (part) =>
            part +
            part,
        )
        .join("");
  }

  const number =
    parseInt(
      value,
      16,
    );

  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}
