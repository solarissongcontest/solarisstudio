import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import "@/calm-public-layout.css";
import "@/calm-public-chrome.css";
import "@/beta2-feedback-fixes.css";
import "@/desktop-public-layouts.css";
import { CountryButtonColourPanel } from "@/components/CountryButtonColourPanel";
import { CountryHodHistoryPanel } from "@/components/CountryHodHistoryPanel";
import { CountryPreviewParityController } from "@/components/CountryPreviewParityController";
import { EditionPublicDesignPanel } from "@/components/EditionPublicDesignPanel";
import { EditionPublicStyles } from "@/components/EditionPublicStyles";
import { resolveCountryButtonTheme } from "@/lib/country-button-theme";
import {
  useContestEntities,
  useCountries,
  useEdition,
  useEditionById,
  useResults,
  useShow,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { showPublishesResults } from "@/lib/publication";
import {
  countryBackgroundCss,
  countryThemeToVisual,
  editionThemeToVisual,
  themeStyleProperties,
  useCountryTheme,
  type CountryVisualTheme,
} from "@/lib/visual-theme";

type EditionVisual = {
  id: string;
  slug: string;
  status?: string;
  theme_colors?: unknown;
  artwork_url?: string | null;
};

type EditionThemeVisual = Exclude<ReturnType<typeof editionThemeToVisual>, null>;

type EditionPublicSettings = {
  style: "cinematic" | "editorial" | "minimal" | "glass";
  radius: number;
  surfaceStrength: number;
  heroGlow: number;
  accentGradient: string | null;
  surfaceGradient: string | null;
};

type ResolvedVisual =
  | { kind: "country"; theme: CountryVisualTheme; artwork: null; publicSettings: null }
  | {
      kind: "edition";
      theme: EditionThemeVisual;
      artwork: string | null;
      publicSettings: EditionPublicSettings;
    };

function segmentAfter(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "");
}

function gradientFromRaw(input: unknown, first: string, second: string) {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (value.enabled === false) return null;
  const number = Number(value.angle);
  const angle = Number.isFinite(number) ? Math.max(0, Math.min(360, number)) : 135;
  return `linear-gradient(${angle}deg, ${first}, ${second})`;
}

function editionPublicSettings(
  raw: unknown,
  theme: EditionThemeVisual,
): EditionPublicSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const requested = String(value.publicStyle ?? "cinematic");
  const styles: EditionPublicSettings["style"][] = [
    "cinematic",
    "editorial",
    "minimal",
    "glass",
  ];
  const style = styles.includes(requested as EditionPublicSettings["style"])
    ? (requested as EditionPublicSettings["style"])
    : "cinematic";
  const clamp = (input: unknown, min: number, max: number, fallback: number) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  return {
    style,
    radius: style === "editorial" ? 0 : clamp(value.publicRadius, 0, 40, 24),
    surfaceStrength: clamp(value.publicSurfaceStrength, 45, 100, 82),
    heroGlow: clamp(value.publicHeroGlow, 0, 100, 72),
    accentGradient: gradientFromRaw(
      value.publicAccentGradient,
      theme.accent,
      theme.backgroundSecondary,
    ),
    surfaceGradient: gradientFromRaw(
      value.publicSurfaceGradient,
      theme.backgroundPrimary,
      theme.backgroundSecondary,
    ),
  };
}

function editionVisual(edition?: EditionVisual | null): ResolvedVisual | null {
  const theme = editionThemeToVisual(edition?.theme_colors);
  return theme
    ? {
        kind: "edition",
        theme,
        artwork: edition?.artwork_url ?? null,
        publicSettings: editionPublicSettings(edition?.theme_colors, theme),
      }
    : null;
}

function isLiveResultContext(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized !== "completed" && normalized !== "finished";
}

export function RouteVisualTheme() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const countryCode =
    segmentAfter(pathname, "/countries/") ?? segmentAfter(pathname, "/wiki/");
  const editionSlug = segmentAfter(pathname, "/editions/");
  const showId = segmentAfter(pathname, "/shows/");

  let visual = <BodyVisualTheme resolved={null} />;
  if (countryCode) visual = <CountryRouteVisual code={countryCode} />;
  else if (editionSlug) visual = <EditionRouteVisual slug={editionSlug} />;
  else if (showId) visual = <ShowRouteVisual showId={showId} />;

  return (
    <>
      {visual}
      <RouteAddons pathname={pathname} />
      <LiquidGlassFilter />
    </>
  );
}

function CountryRouteVisual({ code }: { code: string }) {
  const { data: countries } = useCountries();
  const country = useMemo(
    () =>
      (countries ?? []).find(
        (item) => item.short_code.toLowerCase() === code.toLowerCase(),
      ) ?? null,
    [code, countries],
  );
  const { data: row } = useCountryTheme(country?.id);
  const theme = countryThemeToVisual(row);
  const resolved = theme
    ? ({ kind: "country", theme, artwork: null, publicSettings: null } as const)
    : null;
  const button = useMemo(
    () => resolveCountryButtonTheme(row, row?.accent ?? country?.accent_color ?? "#86c9d7"),
    [row, country?.accent_color],
  );

  useEffect(() => {
    if (!country) return;
    document.body.style.setProperty("--solaris-button", button.buttonColor);
    document.body.style.setProperty("--solaris-button-foreground", button.buttonForeground);
    return () => {
      document.body.style.removeProperty("--solaris-button");
      document.body.style.removeProperty("--solaris-button-foreground");
    };
  }, [country, button]);

  return <BodyVisualTheme resolved={resolved} />;
}

function EditionRouteVisual({ slug }: { slug: string }) {
  const { data: edition } = useEdition(slug);
  useResultRefresh({
    editionSlug: slug,
    live: Boolean(edition && isLiveResultContext(edition.status)),
  });

  return (
    <>
      <EditionPublicStyles />
      <BodyVisualTheme resolved={editionVisual(edition as EditionVisual | null)} />
    </>
  );
}

function ShowRouteVisual({ showId }: { showId: string }) {
  const { data: show } = useShow(showId);
  const { data: edition } = useEditionById(show?.edition_id);
  const { data: results } = useResults(showId);
  const { data: entities } = useContestEntities(show?.edition_id);
  const { data: countries } = useCountries();
  useResultRefresh({
    showId,
    live: Boolean(show && isLiveResultContext(show.status)),
  });

  const winnerFlag = useMemo(() => {
    if (!showPublishesResults(show)) return null;
    const winner = (results ?? [])
      .filter((row) => row.final_rank != null)
      .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))[0];
    if (!winner) return null;
    return entityDisplayMap(entities, countries).get(winner.country_id)?.flag_image ?? null;
  }, [show, results, entities, countries]);

  return (
    <>
      <EditionPublicStyles />
      <BodyVisualTheme
        resolved={editionVisual(edition as EditionVisual | null)}
        currentShowId={showId}
        showWinnerFlag={winnerFlag}
      />
    </>
  );
}

function useResultRefresh({
  showId,
  editionSlug,
  live,
}: {
  showId?: string;
  editionSlug?: string;
  live: boolean;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      if (showId) {
        void queryClient.invalidateQueries({ queryKey: ["results", "show", showId] });
      }
      if (editionSlug) {
        void queryClient.invalidateQueries({ queryKey: ["results", "all"] });
      }
    };

    refresh();
    const interval = live
      ? window.setInterval(refresh, showId ? 3_000 : 12_000)
      : null;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      if (interval != null) window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [editionSlug, live, queryClient, showId]);
}

function RouteAddons({ pathname }: { pathname: string }) {
  const countryThemeEditor =
    pathname === "/country-hub/theme" || pathname === "/country-hub/theme/";
  const countryHub = pathname === "/country-hub" || pathname === "/country-hub/";
  const editionThemeEditor = /^\/admin\/edition-theme\/[^/]+\/?$/.test(pathname);

  return (
    <>
      {countryThemeEditor ? (
        <>
          <CountryPreviewParityController />
          <CountryButtonColourPanel />
        </>
      ) : null}
      {countryHub ? <CountryHodHistoryPanel /> : null}
      {editionThemeEditor ? <EditionPublicDesignPanel /> : null}
    </>
  );
}

function hexTriplet(hex: string) {
  const clean = hex.replace("#", "");
  return `${parseInt(clean.slice(0, 2), 16)} ${parseInt(clean.slice(2, 4), 16)} ${parseInt(clean.slice(4, 6), 16)}`;
}

function BodyVisualTheme({
  resolved,
  currentShowId,
  showWinnerFlag,
}: {
  resolved: ResolvedVisual | null;
  currentShowId?: string;
  showWinnerFlag?: string | null;
}) {
  useEffect(() => {
    const body = document.body;
    const keys = [
      "--solaris-bg-primary",
      "--solaris-bg-secondary",
      "--solaris-bg-tertiary",
      "--solaris-bg-deep",
      "--solaris-bg-deep-2",
      "--solaris-accent",
      "--solaris-accent-foreground",
      "--solaris-owner-surface",
      "--solaris-card-surface",
      "--solaris-card-raised",
      "--foreground",
      "--muted-foreground",
      "--surface",
      "--surface-strong",
      "--primary",
      "--accent",
      "--ring",
      "--jury",
      "--televote",
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--edition-artwork-image",
      "--show-winner-flag-image",
      "--edition-public-radius",
      "--edition-surface-strength",
      "--edition-hero-glow",
      "--edition-accent-gradient",
      "--edition-surface-gradient",
      "--country-page-background",
      "--country-page-position",
      "--country-page-blur",
    ];
    const clear = () => {
      delete body.dataset.entityTheme;
      delete body.dataset.editionArtwork;
      delete body.dataset.editionPublicStyle;
      delete body.dataset.editionAccentGradient;
      delete body.dataset.editionSurfaceGradient;
      delete body.dataset.showWinnerFlag;
      delete body.dataset.countryBackgroundMode;
      delete body.dataset.countryHeroLayout;
      delete body.dataset.countryDecoration;
      keys.forEach((key) => body.style.removeProperty(key));
    };
    if (!resolved) {
      clear();
      return;
    }

    body.dataset.entityTheme = resolved.kind;
    Object.entries(themeStyleProperties(resolved.theme)).forEach(([key, value]) =>
      body.style.setProperty(key, value),
    );

    if (resolved.kind === "country") {
      delete body.dataset.editionPublicStyle;
      delete body.dataset.editionAccentGradient;
      delete body.dataset.editionSurfaceGradient;
      body.dataset.countryBackgroundMode = resolved.theme.backgroundMode;
      body.dataset.countryHeroLayout = resolved.theme.heroLayout;
      body.dataset.countryDecoration = resolved.theme.decorationStyle;
      body.style.setProperty("--country-page-background", countryBackgroundCss(resolved.theme));
      body.style.setProperty(
        "--country-page-position",
        `${resolved.theme.backgroundPositionX}% ${resolved.theme.backgroundPositionY}%`,
      );
      body.style.setProperty("--country-page-blur", `${resolved.theme.backgroundBlur}px`);
    } else {
      delete body.dataset.countryBackgroundMode;
      delete body.dataset.countryHeroLayout;
      delete body.dataset.countryDecoration;
      body.style.removeProperty("--country-page-background");
      body.style.removeProperty("--country-page-position");
      body.style.removeProperty("--country-page-blur");

      body.style.setProperty("--surface", resolved.theme.surface);
      body.style.setProperty(
        "--surface-strong",
        `color-mix(in oklab, ${resolved.theme.surface} 82%, ${resolved.theme.textPrimary} 18%)`,
      );
      body.style.setProperty("--solaris-owner-surface", resolved.theme.surface);
      body.style.setProperty("--solaris-card-surface", hexTriplet(resolved.theme.surface));
      body.style.setProperty("--solaris-card-raised", hexTriplet(resolved.theme.surface));
      body.style.setProperty("--primary", resolved.theme.accent);
      body.style.setProperty("--accent", resolved.theme.accent);
      body.style.setProperty("--ring", resolved.theme.accent);
      body.style.setProperty("--jury", resolved.theme.accent);
      body.style.setProperty("--televote", resolved.theme.backgroundSecondary);
      body.style.setProperty("--chart-1", resolved.theme.accent);
      body.style.setProperty("--chart-2", resolved.theme.backgroundSecondary);
      body.style.setProperty("--chart-3", resolved.theme.backgroundPrimary);

      body.dataset.editionPublicStyle = resolved.publicSettings.style;
      body.style.setProperty("--edition-public-radius", `${resolved.publicSettings.radius}px`);
      body.style.setProperty(
        "--edition-surface-strength",
        String(resolved.publicSettings.surfaceStrength / 100),
      );
      body.style.setProperty(
        "--edition-hero-glow",
        String(resolved.publicSettings.heroGlow / 100),
      );
      if (resolved.publicSettings.accentGradient) {
        body.dataset.editionAccentGradient = "true";
        body.style.setProperty(
          "--edition-accent-gradient",
          resolved.publicSettings.accentGradient,
        );
      } else {
        delete body.dataset.editionAccentGradient;
        body.style.removeProperty("--edition-accent-gradient");
      }
      if (resolved.publicSettings.surfaceGradient) {
        body.dataset.editionSurfaceGradient = "true";
        body.style.setProperty(
          "--edition-surface-gradient",
          resolved.publicSettings.surfaceGradient,
        );
      } else {
        delete body.dataset.editionSurfaceGradient;
        body.style.removeProperty("--edition-surface-gradient");
      }
    }

    if (resolved.artwork) {
      body.dataset.editionArtwork = "true";
      body.style.setProperty(
        "--edition-artwork-image",
        `url(${JSON.stringify(resolved.artwork)})`,
      );
    } else {
      delete body.dataset.editionArtwork;
      body.style.removeProperty("--edition-artwork-image");
    }

    if (currentShowId && showWinnerFlag) {
      body.dataset.showWinnerFlag = "true";
      body.style.setProperty(
        "--show-winner-flag-image",
        `url(${JSON.stringify(showWinnerFlag)})`,
      );
    } else {
      delete body.dataset.showWinnerFlag;
      body.style.removeProperty("--show-winner-flag-image");
    }

    return clear;
  }, [currentShowId, resolved, showWinnerFlag]);

  return null;
}

function LiquidGlassFilter() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      className="pointer-events-none absolute"
    >
      <defs>
        <filter
          id="solaris-liquid-glass"
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.018"
            numOctaves="2"
            seed="17"
            result="glassNoise"
          />
          <feGaussianBlur in="glassNoise" stdDeviation="0.8" result="softGlassNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softGlassNoise"
            scale="5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
