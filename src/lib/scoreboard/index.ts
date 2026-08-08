import {
  resolveTheme,
  type ThemeConfig,
} from "../theme";

import {
  buildPreset,
  defaultScoreboard,
} from "./presets";

import {
  migrateScoreboard,
} from "./resolve";

import type {
  CardZoneConfig,
  ScoreboardConfig,
  ShapeConfig,
  SurfaceConfig,
} from "./types";

export * from "./types";
export * from "./resolve";
export * from "./presets";

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

export type ResolveScoreboardOptions = {
  /**
   * Current show theme.
   *
   * Used to translate the existing Theme Editor settings into the
   * scoreboard engine when the show does not yet have its own scoreboard.
   */
  theme?: ThemeConfig;

  /**
   * Number of countries currently displayed.
   *
   * Used for sensible automatic live-broadcast column selection.
   */
  rowCount?: number;
};

/* -------------------------------------------------------------------------- */
/* Saved scoreboard detection                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Returns true only when broadcast_config contains a real scoreboard object.
 *
 * Old broadcast configs contain things like:
 *
 * {
 *   speed,
 *   scenes,
 *   effects,
 *   spokesperson,
 *   ...
 * }
 *
 * Those values must NOT accidentally be interpreted as ScoreboardConfig.
 */
export function hasSavedScoreboard(
  raw: unknown,
): boolean {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return false;
  }

  const record =
    raw as Record<
      string,
      unknown
    >;

  return (
    "scoreboard" in record &&
    !!record.scoreboard &&
    typeof record.scoreboard ===
      "object"
  );
}

/* -------------------------------------------------------------------------- */
/* Main resolver                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the scoreboard attached to one show.
 *
 * RULES:
 *
 * 1. If the show has an explicitly saved scoreboard:
 *    - preserve it
 *    - migrate it
 *    - do NOT overwrite its geometry from Theme Editor
 *
 * 2. If the show is legacy / has no saved scoreboard:
 *    - use Classic Live Reveal
 *    - inherit the existing Theme Editor design
 *    - automatically create a sensible TV layout
 *
 * This gives old shows a good broadcast immediately while keeping the
 * new Broadcast Studio free to override everything later.
 */
export function resolveScoreboard(
  raw: unknown,
  options: ResolveScoreboardOptions = {},
): ScoreboardConfig {
  const saved =
    hasSavedScoreboard(raw);

  /* ------------------------------------------------------------------------ */
  /* New explicitly-saved scoreboard                                          */
  /* ------------------------------------------------------------------------ */

  if (saved) {
    const source = (
      raw as Record<
        string,
        unknown
      >
    ).scoreboard;

    return migrateScoreboard(
      source,
      defaultScoreboard(),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Legacy broadcast                                                         */
  /* ------------------------------------------------------------------------ */

  /**
   * A live broadcast should never default to the giant single-column
   * Clean Pill results board.
   *
   * Start with Classic Live Reveal instead.
   */
  const base =
    buildPreset(
      "classic-live-reveal",
    );

  const theme =
    options.theme ??
    resolveTheme(undefined);

  return applyLegacyThemeToLiveScoreboard(
    base,
    theme,
    options.rowCount ?? 0,
  );
}

/* -------------------------------------------------------------------------- */
/* Theme → scoreboard bridge                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Converts the original Theme Editor's broadcast-related settings into
 * ScoreboardConfig.
 *
 * This bridge exists for legacy shows that do not yet have their own saved
 * scoreboard configuration.
 */
export function applyLegacyThemeToLiveScoreboard(
  source: ScoreboardConfig,
  theme: ThemeConfig,
  rowCount: number,
): ScoreboardConfig {
  /**
   * Clone so built-in presets are never mutated.
   */
  const config =
    structuredCloneSafe(
      source,
    );

  /* ------------------------------------------------------------------------ */
  /* Canvas                                                                   */
  /* ------------------------------------------------------------------------ */

  config.canvas = {
    ...config.canvas,

    width: 1920,
    height: 1080,

    transparent: false,
    showSafeZones: false,
    zoom: 1,
  };

  /* ------------------------------------------------------------------------ */
  /* Background                                                               */
  /* ------------------------------------------------------------------------ */

  if (
    theme.background.type ===
    "image"
  ) {
    config.background = {
      ...config.background,

      type: "image",

      imageUrl:
        theme.background.imageUrl,

      color:
        theme.background.color,

      gradientFrom:
        theme.background
          .gradientFrom,

      gradientTo:
        theme.background
          .gradientTo,

      gradientAngle:
        theme.background
          .gradientAngle,

      overlay:
        theme.background.overlay,

      blur:
        theme.background.blur,
    };
  } else if (
    theme.background.type ===
    "color"
  ) {
    config.background = {
      ...config.background,

      type: "color",

      color:
        theme.background.color,

      overlay:
        theme.background.overlay,

      blur:
        theme.background.blur,
    };
  } else {
    config.background = {
      ...config.background,

      type: "gradient",

      gradientFrom:
        theme.background
          .gradientFrom,

      gradientTo:
        theme.background
          .gradientTo,

      gradientAngle:
        theme.background
          .gradientAngle,

      overlay:
        theme.background.overlay,

      blur:
        theme.background.blur,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Card                                                                     */
  /* ------------------------------------------------------------------------ */

  const radius =
    resolveThemeRadius(
      theme,
    );

  config.card = {
    ...config.card,

    height:
      theme.card.height,

    gap:
      Math.max(
        4,
        theme.card.gap,
      ),

    radius,

    paddingX:
      theme.card.padding,

    paddingY: 0,

    opacity:
      theme.card.opacity,

    background:
      resolveThemeCardSurface(
        theme,
      ),

    border: {
      width:
        theme.card.borderWidth,

      color:
        theme.card.borderColor,

      style:
        theme.card.borderWidth >
        0
          ? "solid"
          : "none",
    },

    shadow: {
      ...config.card.shadow,

      enabled:
        theme.card.shadow,

      x: 0,

      y: 8,

      blur:
        theme.card.shadow
          ? 24
          : 0,

      spread: -10,

      color:
        theme.card.shadowColor,

      opacity:
        theme.card.shadowStrength,

      inset: false,
    },

    zones:
      config.card.zones.map(
        (zone) =>
          applyThemeToZone(
            zone,
            theme,
          ),
      ),
  };

  /* ------------------------------------------------------------------------ */
  /* Layout                                                                   */
  /* ------------------------------------------------------------------------ */

  /**
   * Theme Editor still gets a say.
   *
   * But a single column with 26 countries is not acceptable for television.
   *
   * For large live boards we automatically promote legacy "single" layouts
   * to two columns unless the show later saves a dedicated scoreboard.
   */
  let columns:
    | 1
    | 2
    | 3
    | 4 = 1;

  if (
    theme.layout.mode ===
    "grid"
  ) {
    columns =
      rowCount > 30
        ? 3
        : 2;
  } else if (
    theme.layout.mode ===
    "two-column"
  ) {
    columns = 2;
  } else {
    columns =
      rowCount > 14
        ? 2
        : 1;
  }

  /**
   * Leave room for the current-jury panel.
   */
  const panelVisible =
    rowCount > 0;

  const panelSize = 300;

  const boardWidth =
    columns === 1
      ? 980
      : columns === 2
        ? 1280
        : 1370;

  config.layout = {
    ...config.layout,

    preset:
      columns === 1
        ? "live-single"
        : columns === 2
          ? "live-two-column"
          : "live-grid",

    columns,

    rowsPerColumn:
      columns > 1
        ? Math.ceil(
            rowCount /
              columns,
          )
        : null,

    distribution:
      "sequential",

    boardWidth,

    boardHeight: null,

    positionX: 0,
    positionY: 0,

    /**
     * Use Theme Editor's gap setting.
     */
    rowGap:
      Math.max(
        4,
        theme.card.gap,
      ),

    columnGap: 24,

    alignment:
      theme.layout.align ===
      "left"
        ? "left"
        : "center",

    verticalAlignment:
      "center",

    safeMarginTop: 56,
    safeMarginRight: 58,
    safeMarginBottom: 48,
    safeMarginLeft: 58,

    columnHeadings: [],
  };

  /* ------------------------------------------------------------------------ */
  /* Header                                                                   */
  /* ------------------------------------------------------------------------ */

  config.header = {
    ...config.header,

    visible: true,

    align: "center",

    marginBottom: 28,

    upper: {
      ...config.header.upper,

      visible: true,

      text:
        "SOLARIS SONG CONTEST",

      typography: {
        ...config.header.upper
          .typography,

        family: "display",

        size: 15,
        minSize: 10,

        weight: 700,

        letterSpacing: 5,

        uppercase: true,

        color:
          "theme:accent",

        align: "center",
      },
    },

    main: {
      ...config.header.main,

      visible: true,

      typography: {
        ...config.header.main
          .typography,

        family: "display",

        size: 44,
        minSize: 24,

        weight: 900,

        letterSpacing: 0,

        uppercase: true,

        color:
          "theme:text",

        align: "center",
      },
    },
  };

  /* ------------------------------------------------------------------------ */
  /* Logo                                                                     */
  /* ------------------------------------------------------------------------ */

  config.logo = {
    ...config.logo,

    visible:
      !!theme.logoUrl,

    url:
      theme.logoUrl,

    width: 150,

    maxHeight: 90,

    align: "center",
  };

  /* ------------------------------------------------------------------------ */
  /* Current voter side panel                                                 */
  /* ------------------------------------------------------------------------ */

  config.panel = {
    ...config.panel,

    visible:
      panelVisible,

    side: "right",

    size:
      panelSize,

    content:
      "current-voter",

    surface: {
      fill: "color",

      color:
        theme.chrome
          .spokespersonBackground,

      color2:
        theme.chrome
          .spokespersonBackground,

      angle: 0,

      opacity: 1,

      blur: 18,
    },

    radius: 18,

    padding: 20,

    label: "",
  };

  /* ------------------------------------------------------------------------ */
  /* Footer / progress                                                        */
  /* ------------------------------------------------------------------------ */

  config.footer = {
    ...config.footer,

    visible: false,
    progressText: false,
  };

  /* ------------------------------------------------------------------------ */
  /* Animations                                                               */
  /* ------------------------------------------------------------------------ */

  config.animation = {
    ...config.animation,

    enabled: true,

    rankMove:
      "spring",

    scoreUpdate:
      "pop",

    entry:
      "fade",

    exit:
      "fade",

    leaderChange:
      "glow",

    respectReducedMotion:
      true,
  };

  return config;
}

/* -------------------------------------------------------------------------- */
/* Card background                                                            */
/* -------------------------------------------------------------------------- */

function resolveThemeCardSurface(
  theme: ThemeConfig,
): SurfaceConfig {
  switch (
    theme.card.backgroundMode
  ) {
    case "solid":
      return {
        fill: "color",

        color:
          theme.card
            .backgroundColor,

        color2:
          theme.card
            .backgroundColor,

        angle: 0,

        opacity:
          theme.card.opacity,

        blur: 0,
      };

    case "glass":
      return {
        fill: "color",

        color:
          theme.card
            .backgroundColor ||
          "#ffffff",

        color2:
          theme.card
            .backgroundColor ||
          "#ffffff",

        angle: 0,

        opacity:
          theme.card.opacity,

        blur:
          theme.card.blur,
      };

    case "country-tinted":
      return {
        fill: "country",

        color: "country",
        color2: "country",

        angle: 0,

        opacity:
          theme.card.opacity,

        blur:
          theme.card.blur,
      };

    case "gradient":
      return {
        fill: "gradient",

        color:
          "theme:primary",

        color2:
          "theme:secondary",

        angle: 110,

        opacity:
          theme.card.opacity,

        blur:
          theme.card.blur,
      };

    default:
      return {
        fill: "color",

        color:
          theme.card
            .backgroundColor,

        color2:
          theme.card
            .backgroundColor,

        angle: 0,

        opacity:
          theme.card.opacity,

        blur:
          theme.card.blur,
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Card radius                                                                */
/* -------------------------------------------------------------------------- */

function resolveThemeRadius(
  theme: ThemeConfig,
): number {
  switch (
    theme.card.shape
  ) {
    case "pill":
      return 999;

    case "square":
      return 0;

    case "rounded":
    default:
      return theme.card.radius;
  }
}

/* -------------------------------------------------------------------------- */
/* Zone inheritance                                                           */
/* -------------------------------------------------------------------------- */

function applyThemeToZone(
  source: CardZoneConfig,
  theme: ThemeConfig,
): CardZoneConfig {
  const zone = {
    ...source,
  };

  /* ------------------------------------------------------------------------ */
  /* Rank                                                                     */
  /* ------------------------------------------------------------------------ */

  if (
    zone.type === "rank"
  ) {
    zone.visible =
      theme.layout.showRank;

    if (
      zone.typography
    ) {
      zone.typography = {
        ...zone.typography,

        family: "body",

        color:
          theme.text.rank,
      };
    }

    return zone;
  }

  /* ------------------------------------------------------------------------ */
  /* Flag                                                                     */
  /* ------------------------------------------------------------------------ */

  if (
    zone.type === "flag"
  ) {
    const flagWidth =
      Math.max(
        28,
        theme.flag.width,
      );

    zone.width =
      flagWidth;

    zone.height =
      Math.round(
        flagWidth /
          Math.max(
            0.2,
            theme.flag.ratio,
          ),
      );

    zone.shape =
      resolveThemeFlagShape(
        theme,
      );

    return zone;
  }

  /* ------------------------------------------------------------------------ */
  /* Country name                                                             */
  /* ------------------------------------------------------------------------ */

  if (
    zone.type ===
    "country-name"
  ) {
    if (
      zone.typography
    ) {
      zone.typography = {
        ...zone.typography,

        family: "body",

        size: Math.max(
          14,
          Math.min(
            20,
            theme.card.height *
              0.3,
          ),
        ),

        color:
          theme.text
            .countryName,
      };
    }

    return zone;
  }

  /* ------------------------------------------------------------------------ */
  /* Total score                                                              */
  /* ------------------------------------------------------------------------ */

  if (
    zone.type === "score"
  ) {
    zone.width =
      Math.max(
        64,
        theme.card.height +
          12,
      );

    if (
      zone.typography
    ) {
      zone.typography = {
        ...zone.typography,

        family: "display",

        size: Math.max(
          18,
          Math.min(
            26,
            theme.card.height *
              0.38,
          ),
        ),

        color:
          theme.text
            .countryScore,
      };
    }

    return zone;
  }

  /* ------------------------------------------------------------------------ */
  /* Jury split                                                               */
  /* ------------------------------------------------------------------------ */

  if (
    zone.type ===
    "jury-score"
  ) {
    zone.visible =
      theme.layout.showSplit;

    if (
      zone.typography
    ) {
      zone.typography = {
        ...zone.typography,

        family: "body",

        color:
          theme.colors.jury,
      };
    }

    return zone;
  }

  /* ------------------------------------------------------------------------ */
  /* Televote split                                                           */
  /* ------------------------------------------------------------------------ */

  if (
    zone.type ===
    "televote-score"
  ) {
    zone.visible =
      theme.layout.showSplit;

    if (
      zone.typography
    ) {
      zone.typography = {
        ...zone.typography,

        family: "body",

        color:
          theme.colors.televote,
      };
    }

    return zone;
  }

  return zone;
}

/* -------------------------------------------------------------------------- */
/* Flag shape                                                                 */
/* -------------------------------------------------------------------------- */

function resolveThemeFlagShape(
  theme: ThemeConfig,
): ShapeConfig {
  switch (
    theme.flag.shape
  ) {
    case "circle":
      return {
        kind: "circle",

        radius: 999,

        leftSlant: 0,
        rightSlant: 0,

        topInset: 0,
        bottomInset: 0,

        direction: "right",

        points: [],
      };

    case "square":
      return {
        kind: "square",

        radius: 0,

        leftSlant: 0,
        rightSlant: 0,

        topInset: 0,
        bottomInset: 0,

        direction: "right",

        points: [],
      };

    case "rect":
      return {
        kind: "rect",

        radius: 0,

        leftSlant: 0,
        rightSlant: 0,

        topInset: 0,
        bottomInset: 0,

        direction: "right",

        points: [],
      };

    case "rounded":
    default:
      return {
        kind: "rounded",

        radius: 5,

        leftSlant: 0,
        rightSlant: 0,

        topInset: 0,
        bottomInset: 0,

        direction: "right",

        points: [],
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Safe clone                                                                 */
/* -------------------------------------------------------------------------- */

function structuredCloneSafe<T>(
  value: T,
): T {
  if (
    typeof structuredClone ===
    "function"
  ) {
    return structuredClone(
      value,
    );
  }

  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as T;
}

/* -------------------------------------------------------------------------- */
/* Preview helper                                                             */
/* -------------------------------------------------------------------------- */

export const previewTheme =
  () =>
    resolveTheme(undefined);
