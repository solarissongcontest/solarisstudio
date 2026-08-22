import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import "@/country-personalities.css";
import "@/country-personalities-v4.css";
import "@/country-personalities-beta2.css";
import "@/calm-public-layout.css";
import "@/calm-public-chrome.css";
import "@/country-glass-parity.css";
import "@/beta2-feedback-fixes.css";
import "@/country-button-theme.css";
import "@/edition-public-design.css";
import "@/edition-public-hotfix.css";
import "@/edition-public-styles-v2.css";
import "@/edition-public-styles-v3.css";
import "@/edition-public-styles-v4.css";
import { CountryButtonColourPanel } from "@/components/CountryButtonColourPanel";
import { CountryButtonThemeController } from "@/components/CountryButtonThemeController";
import { CountryHodHistoryPanel } from "@/components/CountryHodHistoryPanel";
import { CountryPreviewParityController } from "@/components/CountryPreviewParityController";
import { EditionPublicDesignPanel } from "@/components/EditionPublicDesignPanel";
import { useAllShows, useContestEntities, useCountries, useEditions, useResults } from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import {
  countryBackgroundCss,
  countryThemeToVisual,
  editionThemeToVisual,
  themeStyleProperties,
  useCountryThemes,
  type CountryVisualTheme,
} from "@/lib/visual-theme";

type EditionVisual = { id: string; slug: string; theme_colors?: unknown; artwork_url?: string | null };
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
  | { kind: "edition"; theme: EditionThemeVisual; artwork: string | null; publicSettings: EditionPublicSettings };

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

function editionPublicSettings(raw: unknown, theme: EditionThemeVisual): EditionPublicSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const requested = String(value.publicStyle ?? "cinematic");
  const style = (["cinematic", "editorial", "minimal", "glass"] as const).includes(requested as any)
    ? (requested as EditionPublicSettings["style"])
    : "cinematic";
  const clamp = (input: unknown, min: number, max: number, fallback: number) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const squareLocked = style === "editorial" || style === "minimal";
  return {
    style,
    radius: squareLocked ? 0 : clamp(value.publicRadius, 0, 40, 24),
    surfaceStrength: clamp(value.publicSurfaceStrength, 45, 100, 82),
    heroGlow: clamp(value.publicHeroGlow, 0, 100, 72),
    accentGradient: gradientFromRaw(value.publicAccentGradient, theme.accent, theme.backgroundSecondary),
    surfaceGradient: gradientFromRaw(value.publicSurfaceGradient, theme.backgroundPrimary, theme.backgroundSecondary),
  };
}

function hexTriplet(hex: string) {
  const clean = hex.replace("#", "");
  return `${parseInt(clean.slice(0, 2), 16)} ${parseInt(clean.slice(2, 4), 16)} ${parseInt(clean.slice(4, 6), 16)}`;
}

export function RouteVisualTheme() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentShowId = segmentAfter(pathname, "/shows/");
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const currentShow = useMemo(() => (shows ?? []).find((item) => item.id === currentShowId) ?? null, [shows, currentShowId]);
  const { data: currentShowEntities } = useContestEntities(currentShow?.edition_id);
  const { data: currentShowResults } = useResults(currentShowId ?? undefined);
  const { data: countryThemes } = useCountryThemes();

  const resolved = useMemo<ResolvedVisual | null>(() => {
    const countryCode = segmentAfter(pathname, "/countries/") ?? segmentAfter(pathname, "/wiki/");
    if (countryCode) {
      const country = (countries ?? []).find((item) => item.short_code.toLowerCase() === countryCode.toLowerCase());
      const row = country ? (countryThemes ?? []).find((theme) => theme.country_id === country.id) : null;
      const theme = countryThemeToVisual(row);
      if (theme) return { theme, kind: "country", artwork: null, publicSettings: null };
    }

    const visualEditions = (editions ?? []) as EditionVisual[];
    const editionSlug = segmentAfter(pathname, "/editions/");
    if (editionSlug) {
      const edition = visualEditions.find((item) => item.slug === editionSlug);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) return { theme, kind: "edition", artwork: edition?.artwork_url ?? null, publicSettings: editionPublicSettings(edition?.theme_colors, theme) };
    }

    if (currentShowId) {
      const edition = visualEditions.find((item) => item.id === currentShow?.edition_id);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) return { theme, kind: "edition", artwork: edition?.artwork_url ?? null, publicSettings: editionPublicSettings(edition?.theme_colors, theme) };
    }
    return null;
  }, [pathname, currentShowId, currentShow, countries, editions, countryThemes]);

  const showWinnerFlag = useMemo(() => {
    if (!currentShowId) return null;
    const winnerRow = (currentShowResults ?? []).filter((row) => row.final_rank != null).sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))[0];
    if (!winnerRow) return null;
    const displayMap = entityDisplayMap(currentShowEntities, countries);
    return displayMap.get(winnerRow.country_id)?.flag_image ?? null;
  }, [currentShowId, currentShowResults, currentShowEntities, countries]);

  useEffect(() => {
    const body = document.body;
    const keys = ["--solaris-bg-primary","--solaris-bg-secondary","--solaris-bg-tertiary","--solaris-bg-deep","--solaris-bg-deep-2","--solaris-accent","--solaris-accent-foreground","--solaris-owner-surface","--solaris-card-surface","--solaris-card-raised","--foreground","--muted-foreground","--surface","--edition-artwork-image","--show-winner-flag-image","--edition-public-radius","--edition-surface-strength","--edition-hero-glow","--edition-accent-gradient","--edition-surface-gradient","--country-page-background","--country-page-position","--country-page-blur"];
    const clear = () => {
      delete body.dataset.entityTheme; delete body.dataset.editionArtwork; delete body.dataset.editionPublicStyle;
      delete body.dataset.editionAccentGradient; delete body.dataset.editionSurfaceGradient; delete body.dataset.showWinnerFlag;
      delete body.dataset.countryBackgroundMode; delete body.dataset.countryHeroLayout; delete body.dataset.countryDecoration;
      keys.forEach((key) => body.style.removeProperty(key));
    };
    if (!resolved) { clear(); return; }

    body.dataset.entityTheme = resolved.kind;
    const properties = themeStyleProperties(resolved.theme);
    Object.entries(properties).forEach(([key, value]) => body.style.setProperty(key, value));

    if (resolved.kind === "country") {
      delete body.dataset.editionPublicStyle; delete body.dataset.editionAccentGradient; delete body.dataset.editionSurfaceGradient;
      body.dataset.countryBackgroundMode = resolved.theme.backgroundMode;
      body.dataset.countryHeroLayout = resolved.theme.heroLayout;
      body.dataset.countryDecoration = resolved.theme.decorationStyle;
      body.style.setProperty("--country-page-background", countryBackgroundCss(resolved.theme));
      body.style.setProperty("--country-page-position", `${resolved.theme.backgroundPositionX}% ${resolved.theme.backgroundPositionY}%`);
      body.style.setProperty("--country-page-blur", `${resolved.theme.backgroundBlur}px`);
    } else {
      delete body.dataset.countryBackgroundMode; delete body.dataset.countryHeroLayout; delete body.dataset.countryDecoration;
      body.style.removeProperty("--country-page-background"); body.style.removeProperty("--country-page-position"); body.style.removeProperty("--country-page-blur");
      body.style.setProperty("--surface", resolved.theme.surface);
      body.style.setProperty("--solaris-owner-surface", resolved.theme.surface);
      body.style.setProperty("--solaris-card-surface", hexTriplet(resolved.theme.surface));
      body.style.setProperty("--solaris-card-raised", hexTriplet(resolved.theme.surface));
      body.dataset.editionPublicStyle = resolved.publicSettings.style;
      body.style.setProperty("--edition-public-radius", `${resolved.publicSettings.radius}px`);
      body.style.setProperty("--edition-surface-strength", String(resolved.publicSettings.surfaceStrength / 100));
      body.style.setProperty("--edition-hero-glow", String(resolved.publicSettings.heroGlow / 100));
      if (resolved.publicSettings.accentGradient) {
        body.dataset.editionAccentGradient = "true";
        body.style.setProperty("--edition-accent-gradient", resolved.publicSettings.accentGradient);
      } else { delete body.dataset.editionAccentGradient; body.style.removeProperty("--edition-accent-gradient"); }
      if (resolved.publicSettings.surfaceGradient) {
        body.dataset.editionSurfaceGradient = "true";
        body.style.setProperty("--edition-surface-gradient", resolved.publicSettings.surfaceGradient);
      } else { delete body.dataset.editionSurfaceGradient; body.style.removeProperty("--edition-surface-gradient"); }
    }

    if (resolved.artwork) {
      body.dataset.editionArtwork = "true";
      body.style.setProperty("--edition-artwork-image", `url(${JSON.stringify(resolved.artwork)})`);
    } else { delete body.dataset.editionArtwork; body.style.removeProperty("--edition-artwork-image"); }

    if (currentShowId && showWinnerFlag) {
      body.dataset.showWinnerFlag = "true";
      body.style.setProperty("--show-winner-flag-image", `url(${JSON.stringify(showWinnerFlag)})`);
    } else { delete body.dataset.showWinnerFlag; body.style.removeProperty("--show-winner-flag-image"); }

    return clear;
  }, [resolved, currentShowId, showWinnerFlag]);

  return (
    <>
      <CountryPreviewParityController />
      <CountryButtonThemeController />
      <CountryButtonColourPanel />
      <CountryHodHistoryPanel />
      <EditionPublicDesignPanel />
      <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute">
        <defs>
          <filter id="solaris-liquid-glass" x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="17" result="glassNoise" />
            <feGaussianBlur in="glassNoise" stdDeviation="0.8" result="softGlassNoise" />
            <feDisplacementMap in="SourceGraphic" in2="softGlassNoise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
    </>
  );
}
