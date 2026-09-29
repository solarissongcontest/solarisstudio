import { useQuery } from "@tanstack/react-query";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from "@/lib/engagement-data";
import {
  disableAppPush,
  enableAppPush,
  getAppPushState,
  type AppPushState,
} from "@/lib/app-notifications";

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

const DEFAULT_CATEGORIES = ["confirmations", "jury", "televoting", "deadlines", "official", "results"];

const EMPTY_PUSH: AppPushState = {
  supported: false,
  permission: "unsupported",
  subscribed: false,
};

export function MySolarisNotificationsPanel() {
  const userQuery = useQuery({
    queryKey: ["mysolaris-notification-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });
  const userId = userQuery.data?.id;
  const preferences = useNotificationPreferences(userId);
  const save = useSaveNotificationPreferences(userId);
  const push = useQuery({
    enabled: Boolean(userId),
    queryKey: ["solaris-app-push-state", userId],
    queryFn: getAppPushState,
  });

  const [selected, setSelected] = useState<string[]>(DEFAULT_CATEGORIES);
  const [external, setExternal] = useState(false);

  useEffect(() => {
    if (!preferences.data) return;
    setSelected(preferences.data.categories?.length ? preferences.data.categories : DEFAULT_CATEGORIES);
    setExternal(preferences.data.external_enabled);
  }, [preferences.data]);

  const pushState = push.data ?? EMPTY_PUSH;
  const dirty = useMemo(() => {
    const saved = [...(preferences.data?.categories ?? DEFAULT_CATEGORIES)].sort().join("|");
    const current = [...selected].sort().join("|");
    return saved !== current || (preferences.data?.external_enabled ?? false) !== external;
  }, [external, preferences.data, selected]);

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
    });
    toast.promise(promise, {
      loading: "Saving notification preferences…",
      success: "Notification preferences saved.",
      error: (error) =>
        error instanceof Error ? error.message : "Notification preferences could not be saved.",
    });
    await promise;
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
    await promise;
    setExternal(true);
    await save.mutateAsync({
      in_app_enabled: true,
      categories: selected,
      external_enabled: true,
    });
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
    await promise;
    setExternal(false);
    await save.mutateAsync({
      in_app_enabled: true,
      categories: selected,
      external_enabled: false,
    });
    await push.refetch();
  };

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

        <div className="rounded-2xl border border-border/70 bg-background/35 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Push notifications</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {pushState.supported
                  ? pushState.subscribed
                    ? "This device is subscribed to Solaris notifications."
                    : "Enable notifications on this device. Installed Home Screen apps get the best experience."
                  : "This browser does not expose Web Push for Solaris."}
              </p>
            </div>
            {pushState.supported ? (
              pushState.subscribed ? (
                <button type="button" onClick={() => void disablePush()} className="min-h-10 rounded-xl border border-border px-3 text-xs font-semibold">
                  Disable
                </button>
              ) : (
                <button type="button" onClick={() => void enablePush()} className="min-h-10 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground">
                  Enable
                </button>
              )
            ) : null}
          </div>
        </div>

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
