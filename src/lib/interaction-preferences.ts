import { useEffect, useState } from "react";

export type SolarisInteractionPreferences = {
  reducedMotion: boolean;
  reducedTransparency: boolean;
  highContrast: boolean;
};

function matches(query: string) {
  return typeof window !== "undefined" && window.matchMedia?.(query).matches === true;
}

export function readSolarisInteractionPreferences(): SolarisInteractionPreferences {
  return {
    reducedMotion: matches("(prefers-reduced-motion: reduce)"),
    reducedTransparency: matches("(prefers-reduced-transparency: reduce)"),
    highContrast: matches("(forced-colors: active)") || matches("(prefers-contrast: more)"),
  };
}

export function useSolarisInteractionPreferences() {
  const [preferences, setPreferences] = useState<SolarisInteractionPreferences>(() =>
    readSolarisInteractionPreferences(),
  );

  useEffect(() => {
    const queries = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(prefers-reduced-transparency: reduce)"),
      window.matchMedia("(forced-colors: active)"),
      window.matchMedia("(prefers-contrast: more)"),
    ];
    const refresh = () => setPreferences(readSolarisInteractionPreferences());

    queries.forEach((query) => query.addEventListener?.("change", refresh));
    refresh();
    return () => queries.forEach((query) => query.removeEventListener?.("change", refresh));
  }, []);

  return preferences;
}
