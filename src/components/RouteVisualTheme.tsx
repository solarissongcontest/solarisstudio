import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import "@/country-personalities.css";
import "@/country-personalities-v2.css";
import "@/country-personalities-v3.css";
import { useAllShows, useCountries, useEditions } from "@/lib/data";
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

type ResolvedVisual =
  | { kind: "country"; theme: CountryVisualTheme; artwork: null }
  | {
      kind: "edition";
      theme: ReturnType<typeof editionThemeToVisual> extends infer T ? Exclude<T, null> : never;
      artwork: string | null;
    };

function segmentAfter(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "");
}

export function RouteVisualTheme() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
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
      if (theme) return { theme, kind: "country", artwork: null };
    }

    const visualEditions = (editions ?? []) as EditionVisual[];
    const editionSlug = segmentAfter(pathname, "/editions/");
    if (editionSlug) {
      const edition = visualEditions.find((item) => item.slug === editionSlug);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) return { theme, kind: "edition", artwork: edition?.artwork_url ?? null };
    }

    const showId = segmentAfter(pathname, "/shows/");
    if (showId) {
      const show = (shows ?? []).find((item) => item.id === showId);
      const edition = visualEditions.find((item) => item.id === show?.edition_id);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) return { theme, kind: "edition", artwork: edition?.artwork_url ?? null };
    }

    return null;
  }, [pathname, countries, editions, shows, countryThemes]);

  useEffect(() => {
    const body = document.body;
    const keys = [
      "--solaris-bg-primary",
      "--solaris-bg-secondary",
      "--solaris-bg-tertiary",
      "--solaris-bg-deep",
      "--solaris-bg-deep-2",
      "--solaris-accent",
      "--foreground",
      "--muted-foreground",
      "--surface",
      "--edition-artwork-image",
      "--country-page-background",
      "--country-page-position",
      "--country-page-blur",
    ];

    const clear = () => {
      delete body.dataset.entityTheme;
      delete body.dataset.editionArtwork;
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

    return clear;
  }, [resolved]);

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
