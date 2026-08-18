import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { useAllShows, useCountries, useEditions } from "@/lib/data";
import {
  countryThemeToVisual,
  editionThemeToVisual,
  themeStyleProperties,
  useCountryThemes,
} from "@/lib/visual-theme";

type EditionVisual = {
  id: string;
  slug: string;
  theme_colors?: unknown;
  artwork_url?: string | null;
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

    const visualEditions = (editions ?? []) as EditionVisual[];
    const editionSlug = segmentAfter(pathname, "/editions/");
    if (editionSlug) {
      const edition = visualEditions.find((item) => item.slug === editionSlug);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) return { theme, kind: "edition" as const, artwork: edition?.artwork_url ?? null };
    }

    const showId = segmentAfter(pathname, "/shows/");
    if (showId) {
      const show = (shows ?? []).find((item) => item.id === showId);
      const edition = visualEditions.find((item) => item.id === show?.edition_id);
      const theme = editionThemeToVisual(edition?.theme_colors);
      if (theme) return { theme, kind: "edition" as const, artwork: edition?.artwork_url ?? null };
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
    ];

    if (!resolved) {
      delete body.dataset.entityTheme;
      delete body.dataset.editionArtwork;
      keys.forEach((key) => body.style.removeProperty(key));
      return;
    }

    body.dataset.entityTheme = resolved.kind;
    const properties = themeStyleProperties(resolved.theme);
    Object.entries(properties).forEach(([key, value]) => body.style.setProperty(key, value));

    if (resolved.artwork) {
      body.dataset.editionArtwork = "true";
      body.style.setProperty("--edition-artwork-image", `url(${JSON.stringify(resolved.artwork)})`);
    } else {
      delete body.dataset.editionArtwork;
      body.style.removeProperty("--edition-artwork-image");
    }

    return () => {
      delete body.dataset.entityTheme;
      delete body.dataset.editionArtwork;
      keys.forEach((key) => body.style.removeProperty(key));
    };
  }, [resolved]);

  return null;
}
