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

type CategoryKey = (typeof CATEGORIES)[number][0];

const CATEGORY_GROUPS = [
  {
    title: "Contest & delegation",
    description: "Official work and time-sensitive contest responsibilities.",
    keys: ["confirmations", "jury", "deadlines", "official"],
  },
  {
    title: "Live & voting",
    description: "Public voting availability during active shows.",
    keys: ["televoting"],
  },
  {
    title: "Results",
    description: "Published outcomes and score information.",
    keys: ["results"],
  },
  {
    title: "Followed entities",
    description: "Important updates from things you follow.",
    keys: ["following"],
  },
  {
    title: "Optional engagement",
    description: "Prediction and Fantasy activity that is never required participation.",
    keys: ["predictions"],
  },
] as const satisfies readonly {
  title: string;
  description: string;
  keys: readonly CategoryKey[];
}[];

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((category) => [category[0], category] as const));
const DEFAULT_CATEGORIES = [...DEFAULT_SOLARIS_NOTIFICATION_CATEGORIES];

const EMPTY_PUSH: AppPushState = {
  supported: false,
  configured: false,
  permission: "unsupported",
  subscribed: false,
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
    queryFn: getAppPushState,
  });

  const [selected, setSelected] = useState<string[]>(DEFAULT_CATEGORIES);
  const [external, setExternal] = useState(false);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState("23:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [urgent, setUrgent] = useState(true);
  const spoilerFree = appExperience.spoilerFree;
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  useEffect(() => {
    if (!preferences.data) return;
    const savedQuietStart = preferences.data.quiet_hours_start?.slice(0, 5) ?? null;
    const savedQuietEnd = preferences.data.quiet_hours_end?.slice(0, 5) ?? null;

    setSelected(preferences.data.categories?.length ? preferences.data.categories : DEFAULT_CATEGORIES);
    setExternal(preferences.data.external_enabled);
    setQuietHoursEnabled(Boolean(savedQuietStart && savedQuietEnd));
    setQuietStart(savedQuietStart ?? "23:00");
    setQuietEnd(savedQuietEnd ?? "08:00");
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
    const savedQuietStart = preferences.data?.quiet_hours_start?.slice(0, 5) ?? null;
    const savedQuietEnd = preferences.data?.quiet_hours_end?.slice(0, 5) ?? null;
    const savedQuietHoursEnabled = Boolean(savedQuietStart && savedQuietEnd);

    return (
      saved !== current ||
      (preferences.data?.external_enabled ?? false) !== external ||
      savedQuietHoursEnabled !== quietHoursEnabled ||
      (quietHoursEnabled &&
        (savedQuietStart !== quietStart || savedQuietEnd !== quietEnd)) ||
      (preferences.data?.urgent_deadline_reminders ?? true) !== urgent ||
      (preferences.data?.spoiler_free ?? false) !== spoilerFree
    );
  }, [
    external,
    preferences.data,
    quietEnd,
    quietHoursEnabled,
    quietStart,
    selected,
    spoilerFree,
    urgent,
  ]);

  const toggleCategory = (key: string) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const notificationPreferencePayload = (externalEnabled: boolean) => ({
    in_app_enabled: true,
    categories: selected,
    external_enabled: externalEnabled,
    quiet_hours_start: quietHoursEnabled ? quietStart : null,
    quiet_hours_end: quietHoursEnabled ? quietEnd : null,
    urgent_deadline_reminders: urgent,
    spoiler_free: spoilerFree,
    timezone: timeZone,
  });

  const savePreferences = async () => {
    const promise = save.mutateAsync(notificationPreferencePayload(external));
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
      loading: "Enabling notifications…",
      success: "Push notifications enabled.",
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
      await save.mutateAsync(notificationPreferencePayload(true));
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
      await save.mutateAsync(notificationPreferencePayload(false));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notification preferences could not be saved.");
      return;
    }
    await push.refetch();
  };

  if (isAppMode) {
    return (
      <div className="space-y-6">
        <section aria-labelledby="app-notification-categories">
          <div className="solaris-app-section-heading">
            <p>Alerts</p>
            <h2 id="app-notification-categories">What can notify you</h2>
          </div>

          <div className="space-y-5">
            {CATEGORY_GROUPS.map((group) => (
              <div key={group.title}>
                <div className="mb-2 px-1">
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {group.description}
                  </p>
                </div>
                <div className="solaris-app-grouped-list">
                  {group.keys.map((key) => {
                    const category = CATEGORY_BY_KEY.get(key);
                    if (!category) return null;
                    const [, label, description] = category;
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
              </div>
            ))}
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
                      Enable
                    </button>
                  )
                ) : null}
              </div>
            </div>

            <div
              className="solaris-app-notification-row border-t border-border/60"
              data-v3-quiet-hours-mobile=""
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Quiet hours</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {quietHoursEnabled
                    ? `${quietStart}–${quietEnd} · ${timeZone}`
                    : "Off · routine alerts may arrive at any time"}
                </span>
              </span>
              <Switch
                checked={quietHoursEnabled}
                onCheckedChange={setQuietHoursEnabled}
                aria-label="Quiet hours"
              />
            </div>

            {quietHoursEnabled ? (
              <>
                <label className="solaris-app-notification-row border-t border-border/60">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Start</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Routine alerts pause from this time.</span>
                  </span>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={(event) => setQuietStart(event.target.value)}
                    aria-label="Quiet hours start time"
                    className="min-h-11 w-32 rounded-xl border border-border bg-background px-3 text-base"
                  />
                </label>
                <label className="solaris-app-notification-row border-t border-border/60">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">End</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Routine alerts resume at this time.</span>
                  </span>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={(event) => setQuietEnd(event.target.value)}
                    aria-label="Quiet hours end time"
                    className="min-h-11 w-32 rounded-xl border border-border bg-background px-3 text-base"
                  />
                </label>
                <div className="solaris-app-notification-detail border-t border-border/60">
                  <p className="text-xs leading-5 text-muted-foreground">
                    If the end time is earlier than the start time, Quiet Hours runs overnight.
                    Times follow {timeZone} on this device.
                  </p>
                </div>
                <div className="solaris-app-notification-row border-t border-border/60">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Urgent deadline reminders</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      Allow 3-hour and 1-hour required-task reminders during quiet hours.
                    </span>
                  </span>
                  <Switch checked={urgent} onCheckedChange={setUrgent} aria-label="Urgent deadline reminders during quiet hours" />
                </div>
              </>
            ) : null}

            {includeSpoilerFree ? (
              <div className="solaris-app-notification-row border-t border-border/60">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Spoiler-free results</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    Result alerts never reveal the winner in notification text.
                  </span>
                </span>
                <Switch
                  checked={spoilerFree}
                  onCheckedChange={(checked) => updateAppExperience({ spoilerFree: checked })}
                  aria-label="Hide result spoilers"
                />
              </div>
            ) : null}
          </div>
          <RequiredWorkFallback status={deliveryStatus} />
        </section>

        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={() => void savePreferences()}
          className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
        >
          {save.isPending ? "Saving…" : "Save notification settings"}
        </button>
      </div>
    );
  }

  return (
    <Panel
      title="Notifications"
      description="Choose what Solaris may interrupt you for. Completed tasks stop deadline reminders automatically."
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map(([key, label, description]) => {
            const enabled = selected.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={enabled}
                onClick={() => toggleCategory(key)}
                className="flex min-h-16 items-start gap-3 rounded-2xl border border-border/70 bg-background/35 p-3 text-left"
              >
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${enabled ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground"}`}>
                  {enabled ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                    {description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Quiet hours</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {quietHoursEnabled
                    ? `${quietStart}–${quietEnd} · ${timeZone}`
                    : "Off · routine alerts may arrive at any time"}
                </p>
              </div>
              <Switch
                checked={quietHoursEnabled}
                onCheckedChange={setQuietHoursEnabled}
                aria-label="Quiet hours"
              />
            </div>
            {quietHoursEnabled ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Start
                    <input
                      type="time"
                      value={quietStart}
                      onChange={(event) => setQuietStart(event.target.value)}
                      aria-label="Quiet hours start time"
                      className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </label>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    End
                    <input
                      type="time"
                      value={quietEnd}
                      onChange={(event) => setQuietEnd(event.target.value)}
                      aria-label="Quiet hours end time"
                      className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  If End is earlier than Start, the range runs overnight. Times follow {timeZone}.
                </p>
                <label className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/70 px-3 text-xs font-semibold">
                  Urgent deadline reminders during quiet hours
                  <input
                    type="checkbox"
                    checked={urgent}
                    onChange={(event) => setUrgent(event.target.checked)}
                    className="size-5"
                  />
                </label>
              </>
            ) : null}
          </div>

          {includeSpoilerFree ? (
            <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
              <p className="text-sm font-semibold">Spoiler-free mode</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Result notifications say that results are available without revealing the winner in notification text.
              </p>
              <label className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border/70 px-3 text-xs font-semibold">
                Hide result spoilers
                <input
                  type="checkbox"
                  checked={spoilerFree}
                  onChange={(event) =>
                    updateAppExperience({ spoilerFree: event.target.checked })
                  }
                  className="size-5"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Push notifications</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {deliveryStatus.description}
              </p>
            </div>
            {pushState.configured && pushState.supported ? (
              pushState.subscribed ? (
                <button type="button" onClick={() => void disablePush()} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold">
                  Disable
                </button>
              ) : (
                <button type="button" onClick={() => void enablePush()} className="min-h-11 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">
                  Enable
                </button>
              )
            ) : null}
          </div>
        </div>

        <RequiredWorkFallback status={deliveryStatus} />

        <div className="flex justify-end">
          <button
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => void savePreferences()}
            className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
          >
            {save.isPending ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

function RequiredWorkFallback({
  status,
}: {
  status: AppPushDeliveryStatus;
}) {
  return (
    <div
      data-solaris-required-work-fallback=""
      className="mt-3 rounded-2xl border border-sky-300/20 bg-sky-300/[0.055] p-3"
    >
      <p className="text-sm font-semibold">{status.title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {status.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to="/my-solaris/tasks"
          className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
        >
          Open Tasks
        </Link>
        <Link
          to="/my-solaris/notices"
          className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
        >
          Open Notices
        </Link>
      </div>
    </div>
  );
}
