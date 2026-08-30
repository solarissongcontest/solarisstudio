import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { useCountries } from "@/lib/data";
import { useCountryThemes } from "@/lib/visual-theme";

function countryCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/(?:countries|wiki)\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function CountryFlagLayerController() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: countries } = useCountries();
  const { data: themes } = useCountryThemes();
  const code = countryCodeFromPath(pathname);

  const flagEnabled = useMemo(() => {
    if (!code) return null;
    const country = (countries ?? []).find(
      (item) => item.short_code.toLowerCase() === code.toLowerCase(),
    );
    if (!country) return null;
    const row = (themes ?? []).find((item) => item.country_id === country.id) as
      | { flag_enabled?: boolean | null }
      | undefined;

    return row?.flag_enabled !== false;
  }, [code, countries, themes]);

  useEffect(() => {
    if (flagEnabled == null) {
      delete document.body.dataset.countryFlag;
      return;
    }

    document.body.dataset.countryFlag = flagEnabled ? "on" : "off";
    return () => {
      delete document.body.dataset.countryFlag;
    };
  }, [flagEnabled]);

  return (
    <style>{`
      /* The controller only disables flag material. It deliberately does not
         force a flag layer on: each personality owns its exact geometry,
         opacity, crop and whether it uses the background flag at all. */
      body[data-entity-theme="country"][data-country-flag="off"]
        :is(.country-public-hero, .wiki-public-hero) .country-hero-background-flag,
      body[data-entity-theme="country"][data-country-flag="off"]
        .country-theme-live-preview .country-hero-background-flag,
      body[data-entity-theme="country"][data-country-flag="off"]
        :is(.country-public-hero, .wiki-public-hero, .country-theme-live-preview) .country-glass-panel-flag {
        display: none !important;
      }

      /* These personalities already turn the real flag into the composition.
         Do not duplicate it as an identity thumbnail as well. Classic,
         Minimal and Spotlight intentionally keep the small identity flag. */
      body[data-entity-theme="country"]:is(
        [data-country-hero-layout="editorial"],
        [data-country-hero-layout="flag-focus"],
        [data-country-hero-layout="poster"],
        [data-country-hero-layout="split"],
        [data-country-hero-layout="broadcast"],
        [data-country-hero-layout="panorama"],
        [data-country-hero-layout="monument"],
        [data-country-hero-layout="glass-card"],
        [data-country-hero-layout="newspaper"],
        [data-country-hero-layout="ribbon"],
        [data-country-hero-layout="duotone"],
        [data-country-hero-layout="passport"],
        [data-country-hero-layout="horizon"],
        [data-country-hero-layout="heritage"],
        [data-country-hero-layout="sci-fi"],
        [data-country-hero-layout="water-drop"]
      ) :is(.country-public-hero, .wiki-public-hero) .country-hero-identity > :first-child {
        display: none !important;
      }
    `}</style>
  );
}
