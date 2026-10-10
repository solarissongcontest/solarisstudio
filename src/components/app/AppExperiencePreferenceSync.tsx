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
  const savePreference = save.mutateAsync;

  useEffect(() => {
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUserId(session?.user?.id);
    });

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || !preferences.data) return;
    syncAppExperiencePreferencesFromServer({
      spoilerFree: preferences.data.spoiler_free ?? false,
    });
  }, [preferences.data, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onUserChange = (event: Event) => {
      if (!userId) return;

      const next = (event as CustomEvent<SolarisAppExperiencePreferences>).detail;
      if (!next) return;

      const currentServer = preferences.data;
      if (
        currentServer &&
        (currentServer.spoiler_free ?? false) === next.spoilerFree
      ) {
        return;
      }

      void savePreference({
        in_app_enabled: currentServer?.in_app_enabled ?? true,
        categories: currentServer?.categories?.length
          ? currentServer.categories
          : [...DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES],
        external_enabled: currentServer?.external_enabled ?? false,
        quiet_hours_start: currentServer?.quiet_hours_start ?? "23:00",
        quiet_hours_end: currentServer?.quiet_hours_end ?? "08:00",
        urgent_deadline_reminders:
          currentServer?.urgent_deadline_reminders ?? true,
        spoiler_free: next.spoilerFree,
        timezone:
          currentServer?.timezone ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          "UTC",
      }).catch(() => {
        const local = readAppExperiencePreferences();
        if (local.spoilerFree !== next.spoilerFree) {
          syncAppExperiencePreferencesFromServer({
            spoilerFree: next.spoilerFree,
          });
        }
      });
    };

    window.addEventListener(APP_EXPERIENCE_USER_CHANGE_EVENT, onUserChange);
    return () => {
      window.removeEventListener(APP_EXPERIENCE_USER_CHANGE_EVENT, onUserChange);
    };
  }, [preferences.data, savePreference, userId]);

  return null;
}
