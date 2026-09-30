import { useEffect, useState } from "react";

export type SolarisAppExperiencePreferences = {
  spoilerFree: boolean;
};

const STORAGE_KEY = "solaris.app.experience.v1";
const EVENT = "solaris:app-experience-changed";

const DEFAULTS: SolarisAppExperiencePreferences = {
  spoilerFree: false,
};

export function readAppExperiencePreferences(): SolarisAppExperiencePreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SolarisAppExperiencePreferences>;
    return {
      spoilerFree: parsed.spoilerFree === true,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeAppExperiencePreferences(
  next: SolarisAppExperiencePreferences,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Preference is an enhancement. Never break the app when storage is blocked.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

export function useAppExperiencePreferences() {
  const [preferences, setPreferences] = useState<SolarisAppExperiencePreferences>(
    () => readAppExperiencePreferences(),
  );

  useEffect(() => {
    const refresh = () => setPreferences(readAppExperiencePreferences());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<SolarisAppExperiencePreferences>).detail;
      setPreferences(detail ?? readAppExperiencePreferences());
    };
    window.addEventListener("storage", refresh);
    window.addEventListener(EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(EVENT, onCustom);
    };
  }, []);

  const update = (patch: Partial<SolarisAppExperiencePreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    writeAppExperiencePreferences(next);
  };

  return { preferences, update };
}
