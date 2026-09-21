import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import "@/calm-public-layout.css";
import "@/calm-public-chrome.css";
import "@/beta2-feedback-fixes.css";
import "@/desktop-public-layouts.css";
import "@/styles/public-shell.css";
import "@/styles/public-navigation.css";
import "@/styles/public-hubs.css";
import { CountryButtonColourPanel } from "@/components/CountryButtonColourPanel";
import { CountryPreviewParityController } from "@/components/CountryPreviewParityController";
import { EditionPublicDesignPanel } from "@/components/EditionPublicDesignPanel";
import { EditionPublicStyles } from "@/components/EditionPublicStyles";
import { resolveCountryButtonTheme } from "@/lib/country-button-theme";
import {
  resolveEditionPublicSettings,
  type EditionPublicSettings,
} from "@/lib/edition-public-design";
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

function editionVisual(edition?: EditionVisual | null): ResolvedVisual | null {
  const theme = editionThemeToVisual(edition?.theme_colors);
  return theme
    ? {
        kind: "edition",
        theme,
        artwork: edition?.artwork_url ?? null,
        publicSettings: resolveEditionPublicSettings(edition?.theme_colors, theme),
      }
    : null;
}

function isLiveResultContext(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  return normalized !== "completed" && normalized !== "finished";
}

export function RouteVisualTheme() {
  useLiquidGlassBackdropCapability();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const countryCode = segmentAfter(pathname, "/countries/") ?? segmentAfter(pathname, "/wiki/");
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

function useLiquidGlassBackdropCapability() {
  useEffect(() => {
    const body = document.body;
    const ua = navigator.userAgent;
    const hasUAData =
      (navigator as Navigator & { userAgentData?: unknown }).userAgentData != null;
    const isBlink =
      hasUAData ||
      (/\b(?:Chrome|Chromium|Edg)\//.test(ua) &&
        !/\b(?:CriOS|EdgiOS|FxiOS|OPiOS)\b/.test(ua) &&
        !/iPhone|iPad|iPod/.test(ua));

    if (isBlink) body.dataset.liquidGlassSvg = "true";
    else delete body.dataset.liquidGlassSvg;

    return () => {
      delete body.dataset.liquidGlassSvg;
    };
  }, []);
}

function CountryRouteVisual({ code }: { code: string }) {
  const { data: countries } = useCountries();
  const country = useMemo(
    () =>
      (countries ?? []).find((item) => item.short_code.toLowerCase() === code.toLowerCase()) ??
      null,
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
    // Live results still update promptly, but 3-second database polling multiplied across
    // visitors is wasteful. A 30-second cadence is enough for passive public pages;
    // focus/visibility events and mutations can still invalidate immediately.
    const interval = live ? window.setInterval(refresh, 30_000) : null;
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
  const countryThemeEditor = pathname === "/my-solaris/theme" || pathname === "/my-solaris/theme/";
  const editionThemeEditor = /^\/admin\/(?:design|edition-theme)\/[^/]+\/?$/.test(pathname);

  return (
    <>
      {countryThemeEditor ? (
        <>
          <CountryPreviewParityController />
          <CountryButtonColourPanel />
        </>
      ) : null}
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
      "--edition-focal-x",
      "--edition-focal-y",
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
      body.style.setProperty("--edition-hero-glow", String(resolved.publicSettings.heroGlow / 100));
      body.style.setProperty("--edition-focal-x", `${resolved.publicSettings.focalX}%`);
      body.style.setProperty("--edition-focal-y", `${resolved.publicSettings.focalY}%`);
      if (resolved.publicSettings.accentGradient) {
        body.dataset.editionAccentGradient = "true";
        body.style.setProperty("--edition-accent-gradient", resolved.publicSettings.accentGradient);
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
      body.style.setProperty("--edition-artwork-image", `url(${JSON.stringify(resolved.artwork)})`);
    } else {
      delete body.dataset.editionArtwork;
      body.style.removeProperty("--edition-artwork-image");
    }

    if (currentShowId && showWinnerFlag) {
      body.dataset.showWinnerFlag = "true";
      body.style.setProperty("--show-winner-flag-image", `url(${JSON.stringify(showWinnerFlag)})`);
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
        {/* Generic control refraction for legacy/secondary surfaces. The primary
            Country/Wiki and Edition hero materials use the measured per-element
            displacement maps from the vendored liquid-glass engine instead. */}
        <filter
          id="solaris-liquid-glass"
          x="-16%"
          y="-16%"
          width="132%"
          height="132%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.009"
            numOctaves="1"
            seed="29"
            stitchTiles="stitch"
            result="glassField"
          />
          <feGaussianBlur in="glassField" stdDeviation="0.65" result="glassFieldSoft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="glassFieldSoft"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
            result="glassRefracted"
          />
          <feSpecularLighting
            in="glassFieldSoft"
            surfaceScale="1.35"
            specularConstant="0.18"
            specularExponent="28"
            lightingColor="#ffffff"
            result="glassSpecular"
          >
            <feDistantLight azimuth="-52" elevation="58" />
          </feSpecularLighting>
          <feColorMatrix
            in="glassSpecular"
            type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .16 0"
            result="glassSpecularSoft"
          />
          <feBlend in="glassRefracted" in2="glassSpecularSoft" mode="screen" />
        </filter>

        {/* Lower-cost refraction for factual Country/Wiki cards. One octave and
            modest displacement keep INP sane while still bending live backdrop
            pixels instead of merely blurring them. */}
        <filter
          id="solaris-liquid-glass-surface"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.0045 0.007"
            numOctaves="1"
            seed="43"
            stitchTiles="stitch"
            result="surfaceField"
          />
          <feGaussianBlur in="surfaceField" stdDeviation="0.55" result="surfaceFieldSoft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="surfaceFieldSoft"
            scale="3.75"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
