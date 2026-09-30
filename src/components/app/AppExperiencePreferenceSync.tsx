import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  APP_EXPERIENCE_USER_CHANGE_EVENT,
  readAppExperiencePreferences,
  syncAppExperiencePreferencesFromServer,
  type SolarisAppExperiencePreferences,
} from "@/lib/app-experience";
import {
  DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES,
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "@/lib/engagement-data";

export function AppExperiencePreferenceSync() {
  const [userId, setUserId] = useState<string | undefined>();
  const preferences = useNotificationPreferences(userId);
  const save = useSaveNotificationPreferences(userId);

  useEffect(() => {
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || !preferences.data) return;
    const next = {
      spoilerFree: preferences.data.spoiler_free ?? false,
    };
    const current = readAppExperiencePreferences();
    if (current.spoilerFree !== next.spoilerFree) {
      syncAppExperiencePreferencesFromServer(next);
    }
  }, [preferences.data, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onUserPreference = (event: Event) => {
      if (!userId) return;
      const next = (event as CustomEvent<SolarisAppExperiencePreferences>).detail;
      if (!next) return;

      const saved = preferences.data;
      if (saved && (saved.spoiler_free ?? false) === next.spoilerFree) return;

      void save
        .mutateAsync({
          in_app_enabled: saved?.in_app_enabled ?? true,
          categories: saved?.categories?.length
            ? saved.categories
            : [...DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES],
          external_enabled: saved?.external_enabled ?? false,
          quiet_hours_start: saved?.quiet_hours_start ?? "23:00",
          quiet_hours_end: saved?.quiet_hours_end ?? "08:00",
          urgent_deadline_reminders: saved?.urgent_deadline_reminders ?? true,
          spoiler_free: next.spoilerFree,
          timezone:
            saved?.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "UTC",
        })
        .catch(() => {
          // The local preference remains a safe cache. A later server refresh can
          // reconcile it without breaking Results or Show Mode.
        });
    };

    window.addEventListener(APP_EXPERIENCE_USER_CHANGE_EVENT, onUserPreference);
    return () =>
      window.removeEventListener(APP_EXPERIENCE_USER_CHANGE_EVENT, onUserPreference);
  }, [preferences.data, save, userId]);

  return null;
}
