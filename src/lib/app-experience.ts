import { useEffect, useState } from "react";

export type SolarisAppExperiencePreferences = {
  spoilerFree: boolean;
  keepScreenAwake: boolean;
};

const STORAGE_KEY = "solaris.app.experience.v2";
const LEGACY_STORAGE_KEY = "solaris.app.experience.v1";
const EVENT = "solaris:app-experience-changed";
export const APP_EXPERIENCE_USER_CHANGE_EVENT =
  "solaris:app-experience-user-change";

const DEFAULTS: SolarisAppExperiencePreferences = {
  spoilerFree: false,
  keepScreenAwake: false,
};

function parsePreferences(raw: string | null): SolarisAppExperiencePreferences | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SolarisAppExperiencePreferences>;
    return {
      spoilerFree: parsed.spoilerFree === true,
      keepScreenAwake: parsed.keepScreenAwake === true,
    };
  } catch {
    return null;
  }
}

export function readAppExperiencePreferences(): SolarisAppExperiencePreferences {
  if (typeof window === "undefined") return DEFAULTS;
  const current = parsePreferences(window.localStorage.getItem(STORAGE_KEY));
  if (current) return current;

  const legacy = parsePreferences(window.localStorage.getItem(LEGACY_STORAGE_KEY));
  if (legacy) return legacy;

  return DEFAULTS;
}

function persistAppExperiencePreferences(
  next: SolarisAppExperiencePreferences,
  userInitiated: boolean,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Preference is an enhancement. Never break the app when storage is blocked.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  if (userInitiated) {
    window.dispatchEvent(
      new CustomEvent(APP_EXPERIENCE_USER_CHANGE_EVENT, { detail: next }),
    );
  }
}

export function writeAppExperiencePreferences(
  next: SolarisAppExperiencePreferences,
) {
  persistAppExperiencePreferences(next, true);
}

export function syncAppExperiencePreferencesFromServer(input: {
  spoilerFree?: boolean | null;
}) {
  const current = readAppExperiencePreferences();
  const next = {
    ...current,
    ...(typeof input.spoilerFree === "boolean"
      ? { spoilerFree: input.spoilerFree }
      : {}),
  };
  if (
    next.spoilerFree !== current.spoilerFree ||
    next.keepScreenAwake !== current.keepScreenAwake
  ) {
    persistAppExperiencePreferences(next, false);
  }
  return next;
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
