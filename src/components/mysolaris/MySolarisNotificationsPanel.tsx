import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES,
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "@/lib/engagement-data";
import {
  describeAppPushDelivery,
  disableAppPush,
  enableAppPush,
  getAppPushState,
  type AppPushDeliveryStatus,
  type AppPushState,
} from "@/lib/app-notifications";
import {
  syncAppExperiencePreferencesFromServer,
  useAppExperiencePreferences,
} from "@/lib/app-experience";
import { useFanSession } from "@/lib/prediction-data";

const CATEGORIES = [
  ["confirmations", "Confirmations", "Opening times, changes and missing confirmations"],
  ["jury", "Jury voting", "Voting opens and missing official ballots"],
  ["televoting", "Televoting", "Public voting opens and closes"],
  ["deadlines", "Deadline reminders", "Only while a required task is still incomplete"],
  ["official", "Official communications", "Important notices and action requests"],
  ["results", "Results", "Published results and scorecharts"],
  ["following", "Following", "Important updates from followed countries, editions and shows"],
  ["predictions", "Predictions & Fantasy", "Openings, locks and results"],
] as const;

const DEFAULT_CATEGORIES = [...DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES];

const EMPTY_PUSH: AppPushState = {
  supported: false,
  configured: false,
  permission: "unsupported",
  subscribed: false,
  browserSubscribed: false,
  serverRegistered: false,
};

export function MySolarisNotificationsPanel({ includeSpoilerFree = true }: { includeSpoilerFree?: boolean } = {}) {
  const { isAppMode } = useSolarisApp();
  const userQuery = useFanSession();
  const userId = userQuery.data?.id;
  const preferences = useNotificationPreferences(userId);
  const save = useSaveNotificationPreferences(userId);
  const { preferences: appExperience, update: updateAppExperience } =
    useAppExperiencePreferences();
  const push = useQuery({
    enabled: Boolean(userId),
    queryKey: ["solaris-app-push-state", userId],
    queryFn: () => getAppPushState(userId),
  });

  const [selected, setSelected] = useState<string[]>(DEFAULT_CATEGORIES);
  const [external, setExternal] = useState(false);
  const [quietStart, setQuietStart] = useState("23:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [urgent, setUrgent] = useState(true);
  const spoilerFree = appExperience.spoilerFree;

  useEffect(() => {
    if (!preferences.data) return;
    setSelected(preferences.data.categories?.length ? preferences.data.categories : DEFAULT_CATEGORIES);
    setExternal(preferences.data.external_enabled);
    setQuietStart((preferences.data.quiet_hours_start ?? "23:00").slice(0, 5));
    setQuietEnd((preferences.data.quiet_hours_end ?? "08:00").slice(0, 5));
    setUrgent(preferences.data.urgent_deadline_reminders ?? true);
    syncAppExperiencePreferencesFromServer({
      spoilerFree: preferences.data.spoiler_free ?? false,
    });
  }, [preferences.data]);

  const pushState = push.data ?? EMPTY_PUSH;
  const deliveryStatus = describeAppPushDelivery(pushState);
  const dirty = useMemo(() => {
    const saved = [...(preferences.data?.categories ?? DEFAULT_CATEGORIES)].sort().join("|");
    const current = [...selected].sort().join("|");
    return (
      saved !== current ||
      (preferences.data?.external_enabled ?? false) !== external ||
      (preferences.data?.quiet_hours_start ?? "23:00").slice(0, 5) !== quietStart ||
      (preferences.data?.quiet_hours_end ?? "08:00").slice(0, 5) !== quietEnd ||
      (preferences.data?.urgent_deadline_reminders ?? true) !== urgent ||
      (preferences.data?.spoiler_free ?? false) !== spoilerFree
    );
  }, [external, preferences.data, quietEnd, quietStart, selected, spoilerFree, urgent]);

  const toggleCategory = (key: string) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const savePreferences = async () => {
    const promise = save.mutateAsync({
      in_app_enabled: true,
      categories: selected,
      external_enabled: external,
      quiet_hours_start: quietStart || null,
      quiet_hours_end: quietEnd || null,
      urgent_deadline_reminders: urgent,
      spoiler_free: spoilerFree,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
    toast.promise(promise, {
      loading: "Saving notification preferences…",
      success: "Notification preferences saved.",
      error: (error) =>
        error instanceof Error ? error.message : "Notification preferences could not be saved.",
    });
    try {
      await promise;
    } catch {
      return;
    }
  };

  const enablePush = async () => {
    if (!userId) return;
    const promise = enableAppPush(userId);
    toast.promise(promise, {
      loading: pushState.browserSubscribed ? "Repairing notification delivery…" : "Enabling notifications…",
      success: pushState.browserSubscribed ? "Push notification delivery repaired." : "Push notifications enabled.",
      error: (error) =>
        error instanceof Error ? error.message : "Push notifications could not be enabled.",
    });
    try {
      await promise;
    } catch {
      return;
    }
    setExternal(true);
    try {
      await save.mutateAsync({
        in_app_enabled: true,
        categories: selected,
        external_enabled: true,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
        urgent_deadline_reminders: urgent,
        spoiler_free: spoilerFree,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notification preferences could not be saved.");
      return;
    }
    await push.refetch();
  };

  const disablePush = async () => {
    if (!userId) return;
    const promise = disableAppPush(userId);
    toast.promise(promise, {
      loading: "Turning off push notifications…",
      success: "Push notifications disabled.",
      error: "Push notifications could not be disabled.",
    });
    try {
      await promise;
    } catch {
      return;
    }
    setExternal(false);
    try {
      await save.mutateAsync({
        in_app_enabled: true,
        categories: selected,
        external_enabled: false,
        quiet_hours_start: quietStart || null,
        quiet_hours_end: quietEnd || null,
        urgent_deadline_reminders: urgent,
        spoiler_free: spoilerFree,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notification preferences could not be saved.");
      return;
    }
    await push.refetch();
  };

  if (isAppMode) {
    return (
      <div className="space-y-5">
        <section aria-labelledby="app-notification-categories">
          <div className="solaris-app-section-heading">
            <p>Alerts</p>
            <h2 id="app-notification-categories">What can notify you</h2>
          </div>
          <div className="solaris-app-grouped-list">
            {CATEGORIES.map(([key, label, description]) => {
              const enabled = selected.includes(key);
              return (
                <div key={key} className="solaris-app-notification-row">
                  <span className={`solaris-app-list-icon ${enabled ? "" : "is-muted"}`}>
                    {enabled ? <BellRing className="size-4" aria-hidden="true" /> : <BellOff className="size-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
                  </span>
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggleCategory(key)}
                    aria-label={`${label} notifications`}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="app-notification-delivery">
          <div className="solaris-app-section-heading">
            <p>Delivery</p>
            <h2 id="app-notification-delivery">Device & quiet hours</h2>
          </div>
          <div className="solaris-app-grouped-list">
            <div className="solaris-app-notification-detail">
              <div className="flex items-start gap-3">
                <span className="solaris-app-list-icon"><Smartphone className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Push notifications</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {deliveryStatus.description}
                  </span>
                </span>
                {pushState.configured && pushState.supported ? (
                  pushState.subscribed ? (
                    <button type="button" onClick={() => void disablePush()} className="min-h-11 shrink-0 rounded-xl border border-border px-3 text-xs font-semibold">
                      Disable
                    </button>
                  ) : (
                    <button type="button" onClick={() => void enablePush()} className="min-h-11 shrink-0 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">
                      {pushState.browserSubscribed ? "Repair" : "Enable"}
                    </button>
                  )
                ) : null}
              </div>
            </div>

            <div className="solaris-app-notification-detail border-t border-border/60">
              <p className="text-sm font-semibold">Quiet hours</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Routine alerts wait until quiet hours end.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  From
                  <input
                    type="time"
                    value={quietStart}
                    onChange={(event) => setQuietStart(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base"
                  />
                </label>
                <label className="text-[11px] font-semibold text-muted-foreground">
                  Until
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={(event) => setQuietEnd(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base"
                  />
                </label>
              </div>
            </div>
