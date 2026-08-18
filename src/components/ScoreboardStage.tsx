"use client";

import {
  CountryCard,
} from "@/components/broadcast/CountryCard";

import type {
  Country,
  Participant,
} from "@/lib/data";

import type {
  Standing,
} from "@/lib/analysis";

import {
  resolveScoreboard,
  type BroadcastRowData,
  type CardTemplateConfig,
  type ScoreboardConfig,
} from "@/lib/scoreboard";

import type {
  ThemeConfig,
} from "@/lib/theme";

import {
  cn,
} from "@/lib/utils";

/**
 * Public / embedded scoreboard renderer.
 *
 * This now uses the SAME CountryCard engine as the live broadcast.
 *
 * Source of truth:
 *   theme.scoreboardConfig
 *
 * That value is written by the edition Design & Broadcast page.
 *
 * Old editions without a custom card config still get an automatic
 * resolveScoreboard() fallback, so old data does not break.
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
  theme:
    ThemeConfig;

  standings:
    Standing[];

  countries:
    Map<
      string,
      Country
    >;

  participants?:
    Map<
      string,
      Participant
    >;

  awarded?:
    Record<
      string,
      number
    >;

  highlight?:
    string | null;

  votingCountryId?:
    string | null;

  qualifiers?:
    number | null;

  className?:
    string;

  compact?:
    boolean;
}) {
  const rows =
    standings.slice(
      0,
      standings.length,
    );

  const resolved =
    theme.scoreboardConfig ??
    resolveScoreboard(
      null,
      {
        theme,

        rowCount:
          rows.length,
      },
    );

  const columns =
    resolveShowColumns(
      rows.length,
      resolved,
    );

  const card =
    prepareCardForPublicSurface(
      resolved.card,
      theme,
      compact,
    );

  const topAward =
    Math.max(
      0,
      ...Object.values(
        awarded ??
          {},
      ),
    );

  const broadcastRows =
    rows.map<BroadcastRowData>(
      (
        standing,
        index,
      ) => {
        const country =
          countries.get(
            standing.countryId,
          );

        const participant =
          participants?.get(
            standing.countryId,
          );

        const gain =
          awarded?.[
            standing.countryId
          ];

        const qualified =
          qualifiers
            ? standing.rank <=
              qualifiers
            : participant?.qualified ??
              null;

        return {
          id:
            standing.countryId,

          entityType:
            "global",

          name:
            country?.name ??
            standing.countryId,

          abbreviation:
            country?.short_code ??
            "",

          flagImage:
            country?.flag_image ??
            null,

          accent:
            country?.accent_color ??
            theme.colors.primary,

          rank:
            standing.rank,

          runningOrder:
            participant?.running_order ??
            index +
              1,

          score:
            standing.total,

          juryScore:
            standing.jury,

          televoteScore:
            standing.televote,

          movement:
            0,

          qualified:
            qualified ===
            true,

          eliminated:
            qualified ===
            false,

          active:
            votingCountryId ===
            standing.countryId,

          highlighted:
            highlight ===
            standing.countryId,

          leader:
            standing.rank ===
            1,

          winner:
            standing.rank ===
            1,

          subtitle:
            participant?.artist &&
            participant?.song
              ? `${participant.artist} — ${participant.song}`
              : participant?.artist ??
                participant?.song ??
                null,

          /**
           * This is not part of the visual identity itself, but it allows
           * the same award animation to appear on the custom row.
           */
          topPoints:
            gain ===
              topAward &&
            topAward >
              0,
        } as BroadcastRowData;
      },
    );

  const perColumn =
    Math.ceil(
      broadcastRows.length /
        columns,
    );

  const columnRows =
    Array.from(
      {
        length:
          columns,
      },

      (
        _,
        columnIndex,
      ) =>
        broadcastRows.slice(
          columnIndex *
            perColumn,

          (
            columnIndex +
            1
          ) *
            perColumn,
        ),
    );

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",

        columns ===
          2 &&
          "sm:grid-cols-2",

        columns ===
          3 &&
          "sm:grid-cols-2 lg:grid-cols-3",

        columns ===
          4 &&
          "sm:grid-cols-2 xl:grid-cols-4",

        className,
      )}
    >
      {columnRows.map(
        (
          column,
          columnIndex,
        ) => (
          <ol
            key={
              columnIndex
            }
            className="grid min-w-0 content-start"
            style={{
              gap:
                Math.max(
                  2,
                  resolved.layout.rowGap,
                ),
            }}
          >
            {column.map(
              (
                row,
              ) => (
                <CountryCard
                  key={
                    row.id
                  }
                  card={
                    card
                  }
                  theme={
                    theme
                  }
                  row={
                    row
                  }
                  awarded={
                    awarded?.[
                      row.id
                    ] ??
                    null
                  }
                  scale={
                    compact
                      ? 0.86
                      : 1
                  }
                  animate
                />
              ),
            )}
          </ol>
        ),
      )}
    </div>
  );
}

/**
 * The edition shares one card style, while density adapts to each show.
 *
 * Saved board layout may suggest a column count, but we never force a
 * 14-entry semi into 3 columns or a 26-entry final into one huge column.
 */
export function resolveShowColumns(
  rowCount:
    number,

  config:
    ScoreboardConfig,
): 1 | 2 | 3 | 4 {
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

  if (
    rowCount <=
    48
  ) {
    return Math.max(
      2,
      Math.min(
        3,
        config.layout.columns,
      ),
    ) as
      | 2
      | 3;
  }

  return 4;
}

/**
 * Public pages are responsive. The custom design itself is preserved,
 * but a fixed broadcast-only width is released so the row can fit the
 * website column it is placed in.
 *
 * Broadcast cards are allowed to be very translucent because they may sit
 * over a controlled TV background. Public result pages do not have that
 * guarantee, so clamp card/surface opacity here. This keeps the broadcast
 * identity while preventing unreadable combined-result rows on the website.
 */
function prepareCardForPublicSurface(
  card:
    CardTemplateConfig,

  theme:
    ThemeConfig,

  compact:
    boolean | undefined,
): CardTemplateConfig {
  const zones =
    card.zones.map(
      (
        zone,
      ) => {
        if (
          zone.type ===
            "jury-score" ||
          zone.type ===
            "televote-score"
        ) {
          return {
            ...zone,

            visible:
              zone.visible &&
              theme.layout.showSplit,
          };
        }

        if (
          zone.type ===
          "custom-text"
        ) {
          return zone;
        }

        return zone;
      },
    );

  const stateOverrides = Object.fromEntries(
    Object.entries(card.stateOverrides ?? {}).map(([state, override]) => [
      state,
      override
        ? {
            ...override,
            opacity:
              override.opacity == null
                ? override.opacity
                : Math.max(0.9, override.opacity),
            background: override.background
              ? {
                  ...override.background,
                  opacity: Math.max(0.78, override.background.opacity),
                }
              : override.background,
          }
        : override,
    ]),
  ) as CardTemplateConfig["stateOverrides"];

  return {
    ...card,

    width:
      null,

    minWidth:
      null,

    maxWidth:
      null,

    opacity:
      Math.max(
        0.92,
        card.opacity,
      ),

    background: {
      ...card.background,
      opacity: Math.max(0.82, card.background.opacity),
    },

    stateOverrides,

    height:
      compact
        ? Math.max(
            28,
            card.height *
              0.82,
          )
        : card.height,

    zones,
  };
}

/**
 * Retained because a few older helpers import hexA from this module.
 */
export function hexA(
  hex:
    string,

  alpha:
    number,
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
    match[
      1
    ];

  if (
    value.length ===
    3
  ) {
    value =
      value
        .split(
          "",
        )
        .map(
          (
            character,
          ) =>
            character +
            character,
        )
        .join(
          "",
        );
  }

  const number =
    parseInt(
      value,
      16,
    );

  const red =
    (
      number >>
      16
    ) &
    255;

  const green =
    (
      number >>
      8
    ) &
    255;

  const blue =
    number &
    255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
