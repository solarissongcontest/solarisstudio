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
      | ({ flag_enabled?: boolean | null })
      | undefined;

    // The flag now has its own switch. Decorative objects never force the flag
    // on or off, so a delegation can combine both layers or use either alone.
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
      /* Flag visibility is independent from the abstract decoration. This lets
         a country use its flag plus one restrained motif, or no flag at all. */
      body[data-entity-theme="country"][data-country-flag="on"]
        :is(.country-public-hero, .wiki-public-hero) .country-hero-background-flag,
      body[data-entity-theme="country"][data-country-flag="on"]
        .country-theme-live-preview .country-hero-background-flag {
        display: block !important;
      }

      body[data-entity-theme="country"][data-country-flag="off"]
        :is(.country-public-hero, .wiki-public-hero) .country-hero-background-flag,
      body[data-entity-theme="country"][data-country-flag="off"]
        .country-theme-live-preview .country-hero-background-flag,
      body[data-entity-theme="country"][data-country-flag="off"]
        :is(.country-public-hero, .wiki-public-hero, .country-theme-live-preview) .country-glass-panel-flag {
        display: none !important;
      }

      /* Editorial should dissolve slowly into the page, rather than looking
         like a hard flag rectangle pasted on the right. The visible part stays
         restrained: the field is wider, but most of that width is fade. */
      body[data-entity-theme="country"][data-country-hero-layout="editorial"]
        :is(.country-public-hero, .wiki-public-hero) .country-hero-background-flag,
      body[data-entity-theme="country"][data-country-hero-layout="editorial"]
        .country-theme-live-preview .country-hero-background-flag {
        inset: 0 0 0 52% !important;
        width: 48% !important;
        height: 100% !important;
        opacity: .46 !important;
        transform: none !important;
      }

      body[data-entity-theme="country"][data-country-hero-layout="editorial"]
        :is(.country-public-hero, .wiki-public-hero) .country-hero-background-flag::before,
      body[data-entity-theme="country"][data-country-hero-layout="editorial"]
        .country-theme-live-preview .country-hero-background-flag::before {
        -webkit-mask-image: linear-gradient(90deg,
          transparent 0%,
          rgb(0 0 0 / .04) 18%,
          rgb(0 0 0 / .18) 38%,
          rgb(0 0 0 / .48) 58%,
          rgb(0 0 0 / .82) 78%,
          #000 100%) !important;
        mask-image: linear-gradient(90deg,
          transparent 0%,
          rgb(0 0 0 / .04) 18%,
          rgb(0 0 0 / .18) 38%,
          rgb(0 0 0 / .48) 58%,
          rgb(0 0 0 / .82) 78%,
          #000 100%) !important;
      }

      /* Rectangular personalities already use the flag as design material.
         Do not also show the small identity flag chip on Wiki. */
      body[data-entity-theme="country"]:is(
        [data-country-hero-layout="editorial"],
        [data-country-hero-layout="flag-focus"],
        [data-country-hero-layout="poster"],
        [data-country-hero-layout="split"],
        [data-country-hero-layout="broadcast"],
        [data-country-hero-layout="panorama"],
        [data-country-hero-layout="monument"],
        [data-country-hero-layout="newspaper"],
        [data-country-hero-layout="ribbon"],
        [data-country-hero-layout="duotone"],
        [data-country-hero-layout="horizon"]
      ) :is(.country-public-hero, .wiki-public-hero) .country-hero-identity > :first-child {
        display: none !important;
      }
    `}</style>
  );
}