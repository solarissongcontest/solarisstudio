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
import { CountryButtonColourPanel } from "@/components/CountryButtonColourPanel";
import { CountryButtonThemeController } from "@/components/CountryButtonThemeController";
import { CountryHodHistoryPanel } from "@/components/CountryHodHistoryPanel";
import { CountryPreviewParityController } from "@/components/CountryPreviewParityController";
import { EditionPublicDesignPanel } from "@/components/EditionPublicDesignPanel";
import { useAllResults, useAllShows, useCountries, useEditions } from "@/lib/data";
import {
  countryBackgroundCss,
  countryThemeToVisual,
  editionThemeToVisual,
  themeStyleProperties,
  useCountryThemes,
  type CountryVisualTheme,
} from "@/lib/visual-theme";

type EditionVisual = {
  id: string;
  slug: string;
  theme_colors?: unknown;
  artwork_url?: string | null;
};

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
      theme: ReturnType<typeof editionThemeToVisual> extends infer T ? Exclude<T, null> : never;
      artwork: string | null;
      publicSettings: EditionPublicSettings;
    };

function segmentAfter(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "");
}

function gradientFromRaw(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  if (value.enabled === false || !Array.isArray(value.colors)) return null;
  const colors = value.colors
    .filter((color): color is string => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))
    .slice(0, 3);
  if (colors.length < 2) return null;
  const number = Number(value.angle);
  const angle = Number.isFinite(number) ? Math.max(0, Math.min(360, number)) : 135;
  return `linear-gradient(${angle}deg, ${colors.join(", ")})`;
}

function editionPublicSettings(raw: unknown): EditionPublicSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const requested = String(value.publicStyle ?? "cinematic");
  const style = (["cinematic", "editorial", "minimal", "glass"] as const).includes(requested as any)
    ? (requested as EditionPublicSettings["style"])
    : "cinematic";
  const clamp = (input: unknown, min: number, max: number, fallback: number) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  return {
    style,
    radius: clamp(value.publicRadius, 8, 40, 24),
    surfaceStrength: clamp(value.publicSurfaceStrength, 45, 100, 82),
    heroGlow: clamp(value.publicHeroGlow, 0, 100, 72),
    accentGradient: gradientFromRaw(value.publicAccentGradient),
    surfaceGradient: gradientFromRaw(value.publicSurfaceGradient),
  };
}

export function RouteVisualTheme() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();
  const { data: countryThemes } = useCountryThemes();

  const resolved = useMemo<ResolvedVisual | null>(() => {
    const countryCode =
      segmentAfter(pathname, "/countries/") ?? segmentAfter(pathname, "/wiki/");

    if (countryCode) {
      const country = (countries ?? []).find(
        (item) => item.short_code.toLowerCase() === countryCode.toLowerCase(),
      );
      const row = country
        ? (countryThemes ?? []).find((theme) => theme.country_id === country.id)
        : null;
      const theme = countryThemeToVisual(row);
      if (theme) return { theme, kind: "country", artwork: null, publicSettings: null };
    }

    const visualEditions = (editions ?? []) as EditionVisual[];
    const editionSlug = segmentAfter(pathname, "/editions/");
    if (editionSlug) {
      const edition = visualEditions.find((item) => item.slug === editionSlug);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) {
        return {
          theme,
          kind: "edition",
          artwork: edition?.artwork_url ?? null,
          publicSettings: editionPublicSettings(edition?.theme_colors),
        };
      }
    }

    const showId = segmentAfter(pathname, "/shows/");
    if (showId) {
      const show = (shows ?? []).find((item) => item.id === showId);
      const edition = visualEditions.find((item) => item.id === show?.edition_id);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) {
        return {
          theme,
          kind: "edition",
          artwork: edition?.artwork_url ?? null,
          publicSettings: editionPublicSettings(edition?.theme_colors),
        };
      }
    }

    return null;
  }, [pathname, countries, editions, shows, countryThemes]);

  const showWinnerFlag = useMemo(() => {
    const showId = segmentAfter(pathname, "/shows/");
    if (!showId) return null;
    const winnerRow = (results ?? [])
      .filter((row) => row.show_id === showId && row.final_rank != null)
      .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))[0];
    if (!winnerRow) return null;
    return (countries ?? []).find((country) => country.id === winnerRow.country_id)?.flag_image ?? null;
  }, [pathname, results, countries]);

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
    const properties = themeStyleProperties(resolved.theme);
    Object.entries(properties).forEach(([key, value]) => body.style.setProperty(key, value));

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
      body.dataset.editionPublicStyle = resolved.publicSettings.style;
      body.style.setProperty("--edition-public-radius", `${resolved.publicSettings.radius}px`);
      body.style.setProperty("--edition-surface-strength", String(resolved.publicSettings.surfaceStrength / 100));
      body.style.setProperty("--edition-hero-glow", String(resolved.publicSettings.heroGlow / 100));

      if (resolved.publicSettings.accentGradient) {
        body.dataset.editionAccentGradient = "true";
        body.style.setProperty("--edition-accent-gradient", resolved.publicSettings.accentGradient);
      } else {
        delete body.dataset.editionAccentGradient;
        body.style.removeProperty("--edition-accent-gradient");
      }
      if (resolved.publicSettings.surfaceGradient) {
        body.dataset.editionSurfaceGradient = "true";
        body.style.setProperty("--edition-surface-gradient", resolved.publicSettings.surfaceGradient);
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

    if (segmentAfter(pathname, "/shows/") && showWinnerFlag) {
      body.dataset.showWinnerFlag = "true";
      body.style.setProperty("--show-winner-flag-image", `url(${JSON.stringify(showWinnerFlag)})`);
    } else {
      delete body.dataset.showWinnerFlag;
      body.style.removeProperty("--show-winner-flag-image");
    }

    return clear;
  }, [resolved, pathname, showWinnerFlag]);

  return (
    <>
      <CountryPreviewParityController />
      <CountryButtonThemeController />
      <CountryButtonColourPanel />
      <CountryHodHistoryPanel />
      <EditionPublicDesignPanel />
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
    </>
  );
}
