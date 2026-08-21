import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { resolveCountryButtonTheme } from "@/lib/country-button-theme";
import { useCountries } from "@/lib/data";
import { useCountryThemes } from "@/lib/visual-theme";

function segmentAfter(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "");
}

export function CountryButtonThemeController() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: countries } = useCountries();
  const { data: countryThemes } = useCountryThemes();

  const resolved = useMemo(() => {
    const code = segmentAfter(pathname, "/countries/") ?? segmentAfter(pathname, "/wiki/");
    if (!code) return null;
    const country = (countries ?? []).find(
      (item) => item.short_code.toLowerCase() === code.toLowerCase(),
    );
    if (!country) return null;
    const row = (countryThemes ?? []).find((item) => item.country_id === country.id) ?? null;
    return resolveCountryButtonTheme(row, row?.accent ?? country.accent_color);
  }, [pathname, countries, countryThemes]);

  useEffect(() => {
    if (!resolved) return;
    document.body.style.setProperty("--solaris-button", resolved.buttonColor);
    document.body.style.setProperty("--solaris-button-foreground", resolved.buttonForeground);
    return () => {
      document.body.style.removeProperty("--solaris-button");
      document.body.style.removeProperty("--solaris-button-foreground");
    };
  }, [resolved]);

  return null;
}
