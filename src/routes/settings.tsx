import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Database,
  EyeOff,
  MonitorSmartphone,
  MoonStar,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { supabase } from "@/integrations/supabase/client";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import {
  disableAppPush,
  enableAppPush,
  getAppPushState,
  type AppPushState,
} from "@/lib/app-notifications";
import {
  clearOfflinePublicIndex,
  readOfflinePublicIndex,
  type OfflinePublicIndex,
} from "@/lib/app-offline-snapshot";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "App settings — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SettingsPage,
});

type SystemAccessibility = {
  reducedMotion: boolean;
  reducedTransparency: boolean;
};

function SettingsPage() {
  const runtime = useSolarisApp();
  const { preferences, update } = useAppExperiencePreferences();
  const [userId, setUserId] = useState<string | null>(null);
  const [push, setPush] = useState<AppPushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [offlineIndex, setOfflineIndex] = useState<OfflinePublicIndex | null>(() =>
    typeof window === "undefined" ? null : readOfflinePublicIndex(),
  );
  const [accessibility, setAccessibility] = useState<SystemAccessibility>({
    reducedMotion: false,
    reducedTransparency: false,
  });

  const refreshPush = useCallback(async () => {
    try {
      setPush(await getAppPushState());
    } catch {
      setPush({ supported: false, permission: "unsupported", subscribed: false });
    }
  }, []);

  useEffect(() => {
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });

    void refreshPush();

    return () => {
      alive = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [refreshPush]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const transparency = window.matchMedia("(prefers-reduced-transparency: reduce)");

    const refresh = () =>
      setAccessibility({
        reducedMotion: motion.matches,
        reducedTransparency: transparency.matches,
      });

    refresh();
    motion.addEventListener?.("change", refresh);
    transparency.addEventListener?.("change", refresh);

    return () => {
      motion.removeEventListener?.("change", refresh);
      transparency.removeEventListener?.("change", refresh);
    };
  }, []);

  const changePush = async () => {
    if (!userId || !push?.supported || pushBusy) return;

    setPushBusy(true);
    setPushMessage(null);
    try {
      if (push.subscribed) {
        await disableAppPush(userId);
        setPushMessage("Push notifications disabled on this device.");
      } else {
        await enableAppPush(userId);
        setPushMessage("Push notifications enabled on this device.");
      }
      await refreshPush();
    } catch (error) {
      setPushMessage(
        error instanceof Error ? error.message : "Notification settings could not be changed.",
      );
    } finally {
      setPushBusy(false);
    }
  };

  const clearPublicCache = () => {
    clearOfflinePublicIndex();
    setOfflineIndex(null);
  };

  const offlineCount =
    (offlineIndex?.countries.length ?? 0) +
    (offlineIndex?.editions.length ?? 0) +
    (offlineIndex?.shows.length ?? 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="App settings"
        title="Settings"
        description="Device and app-experience preferences. Account identity, security and detailed notification categories remain in MySolaris."
      />

      <div className="mx-auto grid max-w-3xl gap-4">
        <Panel
          title="App experience"
          description="Preferences that change how Solaris presents live and result information."
        >
          <div className="divide-y divide-border/60">
            <SettingsSwitch
              icon={<EyeOff className="size-4" aria-hidden="true" />}
              title="Spoiler-free mode"
              description="Hide winner and ranking previews until you deliberately reveal them."
              checked={preferences.spoilerFree}
              onChange={(checked) => update({ spoilerFree: checked })}
            />
            <SettingsSwitch
              icon={<MoonStar className="size-4" aria-hidden="true" />}
              title="Keep screen awake in Show Mode"
              description="When supported, prevent the display from sleeping while you actively use Show Mode."
              checked={preferences.keepScreenAwake}
              onChange={(checked) => update({ keepScreenAwake: checked })}
            />
          </div>
        </Panel>

        <Panel
          title="Notifications"
          description="Device push delivery. Notification categories and quiet hours stay in your signed-in MySolaris account."
        >
          <div className="flex items-start gap-3">
            <SettingIcon>
              <Bell className="size-4" aria-hidden="true" />
            </SettingIcon>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {!push
                  ? "Checking this device…"
                  : !push.supported
                    ? "Push is unavailable here"
                    : push.subscribed
                      ? "Push is enabled"
                      : "Push is off"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {!userId
                  ? "Sign in before enabling personal Solaris notifications."
                  : push?.permission === "denied"
                    ? "Notification permission is blocked in your browser or device settings."
                    : "Solaris only requests notification permission after you choose to enable it."}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {userId && push?.supported ? (
                  <button
                    type="button"
                    disabled={pushBusy || push.permission === "denied"}
                    onClick={() => void changePush()}
                    className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {pushBusy ? "Updating…" : push.subscribed ? "Disable on this device" : "Enable notifications"}
                  </button>
                ) : !userId ? (
                  <Link
                    to="/auth"
                    className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  >
                    Sign in
                  </Link>
                ) : null}

                {userId ? (
                  <Link
                    to="/my-solaris/account"
                    className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
                  >
                    Notification categories
                  </Link>
                ) : null}
              </div>

              {pushMessage ? (
                <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">
                  {pushMessage}
                </p>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel
          title="Offline & storage"
          description="Only safe public archive metadata is stored for the offline fallback. Critical drafts use their own protected workflow storage."
        >
          <div className="flex items-start gap-3">
            <SettingIcon>
              <Database className="size-4" aria-hidden="true" />
            </SettingIcon>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {offlineIndex ? String(offlineCount) + " public items saved" : "No saved public offline index"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {offlineIndex
                  ? "Last updated " + formatSavedAt(offlineIndex.savedAt) + ". Clearing this does not delete confirmation, jury or voting drafts."
                  : "Solaris rebuilds the safe public index after normal online use."}
              </p>
              {offlineIndex ? (
                <button
                  type="button"
                  onClick={clearPublicCache}
                  className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
                >
                  Clear saved public index
                </button>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel
          title="Accessibility"
          description="Solaris follows system accessibility preferences rather than maintaining conflicting copies."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<Radio className="size-4" aria-hidden="true" />}
              label="Reduced motion"
              value={accessibility.reducedMotion ? "On in system" : "System default"}
            />
            <StatusCard
              icon={<ShieldCheck className="size-4" aria-hidden="true" />}
              label="Reduced transparency"
              value={accessibility.reducedTransparency ? "On in system" : "System default"}
            />
          </div>
        </Panel>

        <Panel
          title="App & connection"
          description="Current runtime and service state for this device."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={<MonitorSmartphone className="size-4" aria-hidden="true" />}
              label="Runtime"
              value={
                runtime.isNative
                  ? "Native shell"
                  : runtime.isAppMode
                    ? "Installed app"
                    : "Web browser"
              }
            />
            <StatusCard
              icon={<Radio className="size-4" aria-hidden="true" />}
              label="Solaris connection"
              value={connectivityLabel(runtime.connectivity.status)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {userId ? (
              <Link
                to="/my-solaris/account"
                className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
              >
                Account & security
              </Link>
            ) : null}
            <Link
              to="/guide"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Help
            </Link>
            <Link
              to="/integrity"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
            >
              Trust & Integrity
            </Link>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function SettingsSwitch({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-[4.5rem] items-center gap-3 py-3">
      <SettingIcon>{icon}</SettingIcon>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className="relative h-8 w-[3.15rem] shrink-0 rounded-full border border-border bg-surface transition-colors data-[checked=true]:border-primary/40 data-[checked=true]:bg-primary/25"
        data-checked={checked}
      >
        <span
          className="absolute left-1 top-1 size-6 rounded-full bg-foreground shadow-sm transition-transform data-[checked=true]:translate-x-[1.1rem]"
          data-checked={checked}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

function SettingIcon({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
      {children}
    </span>
  );
}

function StatusCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[4.5rem] items-center gap-3 rounded-xl border border-border/70 bg-surface/45 p-3">
      <SettingIcon>{icon}</SettingIcon>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function connectivityLabel(status: string) {
  switch (status) {
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "degraded":
      return "Degraded";
    case "service-restricted":
      return "Service restricted";
    default:
      return status;
  }
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "on this device";
  return date.toLocaleString();
}
