import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { resolveCountryButtonTheme } from "@/lib/country-button-theme";
import { useCountries } from "@/lib/data";
import { useCountryTheme } from "@/lib/visual-theme";

function segmentAfter(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return null;
  return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "");
}

export function CountryButtonThemeController() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const code = segmentAfter(pathname, "/countries/") ?? segmentAfter(pathname, "/wiki/");
  const { data: countries } = useCountries();
  const country = useMemo(() => {
    if (!code) return null;
    return (
      (countries ?? []).find(
        (item) => item.short_code.toLowerCase() === code.toLowerCase(),
      ) ?? null
    );
  }, [code, countries]);
  const { data: countryTheme } = useCountryTheme(country?.id);

  const resolved = useMemo(() => {
    if (!country) return null;
    return resolveCountryButtonTheme(
      countryTheme ?? null,
      countryTheme?.accent ?? country.accent_color,
    );
  }, [country, countryTheme]);

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
