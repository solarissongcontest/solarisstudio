"use client";

import { useEffect, useState } from "react";

import { CountryCard } from "@/components/broadcast/CountryCard";
import type { Country, Participant } from "@/lib/data";
import type { Standing } from "@/lib/analysis";
import {
  resolveScoreboard,
  type BroadcastRowData,
  type CardTemplateConfig,
  type ScoreboardConfig,
} from "@/lib/scoreboard";
import type { ThemeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

type EditionPublicStyle = "cinematic" | "editorial" | "minimal" | "glass";

/**
 * Public / embedded scoreboard renderer.
 *
 * The built-in Classic scoreboard should feel like part of the edition page,
 * not like a separate neon widget dropped on top of it. Custom scoreboard
 * presets remain untouched; organizers can still replace Classic completely.
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
  votingCountryId?: string | null;
  qualifiers?: number | null;
  className?: string;
  compact?: boolean;
}) {
  const rows = standings.slice(0, standings.length);
  const [editionStyle, setEditionStyle] = useState<EditionPublicStyle | null>(null);

  useEffect(() => {
    const read = () => {
      const value = document.body.dataset.editionPublicStyle;
      setEditionStyle(
        value === "cinematic" || value === "editorial" || value === "minimal" || value === "glass"
          ? value
          : null,
      );
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-edition-public-style"] });
    return () => observer.disconnect();
  }, []);

  const baseResolved =
    theme.scoreboardConfig ??
    resolveScoreboard(null, {
      theme,
      rowCount: rows.length,
    });

  const isClassic = baseResolved.card.preset === "classic-live-reveal" || !theme.scoreboardConfig;
  const resolved = isClassic && editionStyle
    ? matchClassicToEditionStyle(baseResolved, theme, editionStyle)
    : baseResolved;

  const columns = resolveShowColumns(rows.length, resolved);
  const card = prepareCardForPublicSurface(resolved.card, theme, compact, editionStyle, isClassic);
  const topAward = Math.max(0, ...Object.values(awarded ?? {}));

  const broadcastRows = rows.map<BroadcastRowData>((standing, index) => {
    const country = countries.get(standing.countryId);
    const participant = participants?.get(standing.countryId);
    const gain = awarded?.[standing.countryId];
    const qualified = qualifiers
      ? standing.rank <= qualifiers
      : participant?.qualified ?? null;

    return {
      id: standing.countryId,
      entityType: "global",
      name: country?.name ?? standing.countryId,
      abbreviation: country?.short_code ?? "",
      flagImage: country?.flag_image ?? null,
      accent: country?.accent_color ?? theme.colors.primary,
      rank: standing.rank,
      runningOrder: participant?.running_order ?? index + 1,
      score: standing.total,
      juryScore: standing.jury,
      televoteScore: standing.televote,
      movement: 0,
      qualified: qualified === true,
      eliminated: qualified === false,
      active: votingCountryId === standing.countryId,
      highlighted: highlight === standing.countryId,
      leader: standing.rank === 1,
      winner: standing.rank === 1,
      subtitle:
        participant?.artist && participant?.song
          ? `${participant.artist} — ${participant.song}`
          : participant?.artist ?? participant?.song ?? null,
      topPoints: gain === topAward && topAward > 0,
    } as BroadcastRowData;
  });

  const perColumn = Math.ceil(broadcastRows.length / columns);
  const columnRows = Array.from({ length: columns }, (_, columnIndex) =>
    broadcastRows.slice(columnIndex * perColumn, (columnIndex + 1) * perColumn),
  );

  const openCountryFromColumn = (
    event: React.MouseEvent<HTMLOListElement>,
    column: BroadcastRowData[],
  ) => {
    if (typeof window === "undefined" || window.location.pathname.startsWith("/admin/")) return;

    const target = event.target as HTMLElement;
    const rowElement = target.closest("li");
    if (!rowElement || rowElement.parentElement !== event.currentTarget) return;

    const rowElements = Array.from(event.currentTarget.children);
    const rowIndex = rowElements.indexOf(rowElement);
    const row = column[rowIndex];
    if (!row) return;

    const country = countries.get(row.id);
    if (!country?.short_code) return;

    window.location.assign(`/countries/${encodeURIComponent(country.short_code)}`);
  };

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
      data-scoreboard-edition-style={isClassic ? editionStyle ?? undefined : undefined}
    >
      {columnRows.map((column, columnIndex) => (
        <ol
          key={columnIndex}
          className="grid min-w-0 content-start [&>li]:cursor-pointer"
          style={{ gap: Math.max(2, resolved.layout.rowGap) }}
          onClick={(event) => openCountryFromColumn(event, column)}
        >
          {column.map((row) => (
            <CountryCard
              key={row.id}
              card={card}
              theme={theme}
              row={row}
              awarded={awarded?.[row.id] ?? null}
              scale={compact ? 0.86 : 1}
              animate
            />
          ))}
        </ol>
      ))}

      {typeof window === "undefined" || !window.location.pathname.startsWith("/admin/") ? (
        <p className="col-span-full mt-1 text-center text-[10px] text-muted-foreground">
          Tap a country on the scoreboard to open its profile.
        </p>
      ) : null}
    </div>
  );
}

function matchClassicToEditionStyle(
  source: ScoreboardConfig,
  theme: ThemeConfig,
  style: EditionPublicStyle,
): ScoreboardConfig {
  const config = structuredClone(source) as ScoreboardConfig;
  const flagRadius = style === "editorial" || style === "minimal" ? 0 : style === "glass" ? 8 : 10;

  config.card.zones = config.card.zones.map((zone) =>
    zone.type === "flag"
      ? {
          ...zone,
          shape: {
            ...zone.shape,
            kind: flagRadius === 0 ? "rect" : "rounded",
            radius: flagRadius,
          },
        }
      : zone,
  );

  if (style === "glass") {
    config.card.radius = 22;
    config.card.background = {
      ...config.card.background,
      fill: "color",
      color: theme.chrome.panelBackground,
      color2: theme.chrome.panelBackground,
      opacity: 0.12,
      blur: 8,
    };
    config.card.border = { width: 1, color: "#ffffff", style: "solid" };
    config.card.shadow = {
      ...config.card.shadow,
      enabled: true,
      x: 0,
      y: 10,
      blur: 28,
      spread: -16,
      color: "#000000",
      opacity: 0.22,
    };
    config.card.glow = { ...config.card.glow, enabled: false };
    config.layout.rowGap = Math.max(8, Math.min(12, config.layout.rowGap));
  } else if (style === "editorial") {
    config.card.radius = 0;
    config.card.background = {
      ...config.card.background,
      fill: "color",
      color: theme.colors.primary,
      color2: theme.colors.primary,
      opacity: 0.08,
      blur: 0,
    };
    config.card.border = { width: 1, color: theme.colors.accent, style: "solid" };
    config.card.shadow = { ...config.card.shadow, enabled: false };
    config.card.glow = { ...config.card.glow, enabled: false };
    config.layout.rowGap = 6;
  } else if (style === "minimal") {
    config.card.radius = 0;
    config.card.background = {
      ...config.card.background,
      fill: "color",
      color: theme.colors.primary,
      color2: theme.colors.primary,
      opacity: 0.045,
      blur: 0,
    };
    config.card.border = { width: 1, color: theme.colors.primary, style: "solid" };
    config.card.shadow = { ...config.card.shadow, enabled: false };
    config.card.glow = { ...config.card.glow, enabled: false };
    config.layout.rowGap = 7;
  } else {
    config.card.radius = 18;
    config.card.background = {
      ...config.card.background,
      fill: "gradient",
      color: theme.colors.primary,
      color2: theme.colors.secondary,
      angle: 120,
      opacity: 0.22,
      blur: 0,
    };
    config.card.border = { width: 1, color: theme.colors.accent, style: "solid" };
    config.card.shadow = {
      ...config.card.shadow,
      enabled: true,
      x: 0,
      y: 10,
      blur: 30,
      spread: -16,
      color: "#000000",
      opacity: 0.26,
    };
    config.card.glow = {
      ...config.card.glow,
      enabled: true,
      color: theme.colors.accent,
      blur: 30,
      spread: -18,
      opacity: 0.24,
    };
    config.layout.rowGap = 8;
  }

  config.card.stateOverrides = {
    ...config.card.stateOverrides,
    leader: {
      ...(config.card.stateOverrides.leader ?? {}),
      background: {
        fill: "gradient",
        color: theme.colors.primary,
        color2: theme.colors.secondary,
        angle: 110,
        opacity: style === "glass" ? 0.20 : 0.34,
        blur: style === "glass" ? 8 : 0,
      },
    },
    winner: {
      ...(config.card.stateOverrides.winner ?? {}),
      background: {
        fill: "gradient",
        color: theme.colors.primary,
        color2: theme.colors.secondary,
        angle: 110,
        opacity: style === "glass" ? 0.24 : 0.40,
        blur: style === "glass" ? 8 : 0,
      },
    },
  };

  return config;
}

export function resolveShowColumns(
  rowCount: number,
  config: ScoreboardConfig,
): 1 | 2 | 3 | 4 {
  if (rowCount <= 14) return 1;
  if (rowCount <= 30) return 2;

  if (rowCount <= 48) {
    return Math.max(2, Math.min(3, config.layout.columns)) as 2 | 3;
  }

  return 4;
}

function prepareCardForPublicSurface(
  card: CardTemplateConfig,
  theme: ThemeConfig,
  compact: boolean | undefined,
  editionStyle: EditionPublicStyle | null,
  isClassic: boolean,
): CardTemplateConfig {
  const zones = card.zones.map((zone) => {
    if (zone.type === "jury-score" || zone.type === "televote-score") {
      return {
        ...zone,
        visible: zone.visible && theme.layout.showSplit,
      };
    }
    return zone;
  });

  const preserveTransparency = isClassic && editionStyle === "glass";
  const stateOverrides = Object.fromEntries(
    Object.entries(card.stateOverrides ?? {}).map(([state, override]) => [
      state,
      override
        ? {
            ...override,
            opacity: preserveTransparency
              ? override.opacity
              : override.opacity == null
                ? override.opacity
                : Math.max(0.97, override.opacity),
            background: override.background
              ? {
                  ...override.background,
                  opacity: preserveTransparency
                    ? override.background.opacity
                    : Math.max(0.9, override.background.opacity),
                }
              : override.background,
          }
        : override,
    ]),
  ) as CardTemplateConfig["stateOverrides"];

  return {
    ...card,
    width: null,
    minWidth: null,
    maxWidth: null,
    opacity: preserveTransparency ? card.opacity : Math.max(0.98, card.opacity),
    background: {
      ...card.background,
      opacity: preserveTransparency ? card.background.opacity : Math.max(0.92, card.background.opacity),
    },
    stateOverrides,
    height: compact ? Math.max(28, card.height * 0.82) : card.height,
    zones,
  };
}

export function hexA(hex: string, alpha: number) {
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!match) return hex;

  let value = match[1];
  if (value.length === 3) {
    value = value.split("").map((character) => character + character).join("");
  }

  const number = parseInt(value, 16);
  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
