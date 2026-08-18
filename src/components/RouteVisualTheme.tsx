import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { useAllShows, useCountries, useEditions } from "@/lib/data";
import {
  countryThemeToVisual,
  editionThemeToVisual,
  themeStyleProperties,
  useCountryThemes,
  type VisualTheme,
} from "@/lib/visual-theme";

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

  const resolved = useMemo(() => {
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
      if (theme) return { theme, kind: "country" as const, artwork: null as string | null };
    }

    const editionSlug = segmentAfter(pathname, "/editions/");
    if (editionSlug) {
      const edition = (editions ?? []).find((item) => item.slug === editionSlug) as
        | ((typeof editions extends Array<infer E> ? E : never) & {
            theme_colors?: unknown;
            artwork_url?: string | null;
          })
        | undefined;
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) {
        return { theme, kind: "edition" as const, artwork: edition?.artwork_url ?? null };
      }
    }

    const showId = segmentAfter(pathname, "/shows/");
    if (showId) {
      const show = (shows ?? []).find((item) => item.id === showId);
      const edition = (editions ?? []).find((item) => item.id === show?.edition_id) as
        | ((typeof editions extends Array<infer E> ? E : never) & {
            theme_colors?: unknown;
            artwork_url?: string | null;
          })
        | undefined;
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) {
        return { theme, kind: "edition" as const, artwork: edition?.artwork_url ?? null };
      }
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
    ];

    if (!resolved) {
      delete body.dataset.entityTheme;
      delete body.dataset.editionArtwork;
      keys.forEach((key) => body.style.removeProperty(key));
      return;
    }

    body.dataset.entityTheme = resolved.kind;
    if (resolved.artwork) body.dataset.editionArtwork = "true";
    else delete body.dataset.editionArtwork;

    const properties = themeStyleProperties(resolved.theme as VisualTheme);
    Object.entries(properties).forEach(([key, value]) => body.style.setProperty(key, value));

    return () => {
      delete body.dataset.entityTheme;
      delete body.dataset.editionArtwork;
      keys.forEach((key) => body.style.removeProperty(key));
    };
  }, [resolved]);

  return null;
}
