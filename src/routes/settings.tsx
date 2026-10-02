import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BellRing,
  Database,
  EyeOff,
  Info,
  MoonStar,
  Smartphone,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisNotificationsPanel } from "@/components/mysolaris/MySolarisNotificationsPanel";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import {
  clearOfflinePublicIndex,
  readOfflinePublicIndex,
  type OfflinePublicIndex,
} from "@/lib/app-offline-snapshot";
import {
  clearSolarisRuntimeCaches,
  estimateSolarisStorage,
  type SolarisStorageEstimate,
} from "@/lib/app-storage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "App Settings — Solaris Studio" },
      {
        name: "description",
        content: "Solaris Studio app, notification, accessibility, offline and install settings.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppSettingsPage,
});

const EMPTY_STORAGE: SolarisStorageEstimate = {
  usage: null,
  quota: null,
};

function formatBytes(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Not reported";
  if (value < 1024 * 1024) return Math.round(value / 1024) + " KB";
  return (value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0) + " MB";
}

function AppSettingsPage() {
  const app = useSolarisApp();
  const { preferences, update } = useAppExperiencePreferences();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [accessibility, setAccessibility] = useState({
    reducedMotion: false,
    reducedTransparency: false,
  });
  const [offlineIndex, setOfflineIndex] = useState<OfflinePublicIndex | null>(() =>
    typeof window === "undefined" ? null : readOfflinePublicIndex(),
  );
  const [storage, setStorage] = useState<SolarisStorageEstimate>(EMPTY_STORAGE);
  const [clearing, setClearing] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    let alive = true;
    void estimateSolarisStorage()
      .then((next) => {
        if (alive) setStorage(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const clearOffline = async () => {
    setClearing(true);
    setStorageMessage(null);
    try {
      const removed = await clearSolarisRuntimeCaches();
      clearOfflinePublicIndex();
      setOfflineIndex(null);
      const next = await estimateSolarisStorage();
      setStorage(next);
      setStorageMessage(
        removed > 0
          ? "Cleared " + removed + " cached app asset" + (removed === 1 ? "" : "s") + " and the saved public offline index. Critical drafts and device state were kept."
          : "Cleared the saved public offline index. Critical drafts and device state were kept.",
      );
    } catch {
      setStorageMessage("Cached app assets could not be cleared on this browser.");
    } finally {
      setClearing(false);
    }
  };

  const offlineCount =
    (offlineIndex?.countries.length ?? 0) +
    (offlineIndex?.editions.length ?? 0) +
    (offlineIndex?.shows.length ?? 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Solaris Studio"
        title="App Settings"
        description="App behavior, notifications, accessibility, offline storage and install status in one place."
      />

      <div className="space-y-4">
        <Panel
          className={app.isAppMode ? "solaris-app-settings-panel" : undefined}
          title="App experience"
          description="Preferences that change how the installed Solaris experience behaves."
        >
          <div className="solaris-app-settings-group grid gap-3">
            <SettingRow
              icon={EyeOff}
              title="Spoiler-free mode"
              description="Hide winner, ranking and score previews until you deliberately reveal a published result."
              control={
                <Switch
                  checked={preferences.spoilerFree}
                  onCheckedChange={(checked) => update({ spoilerFree: checked })}
                  aria-label="Spoiler-free mode"
                />
              }
            />
            <SettingRow
              icon={Sun}
              title="Keep screen awake in Show Mode"
              description="Request a screen wake lock only while Show Mode is actively following a live show, voting or result reveal."
              control={
                <Switch
                  checked={preferences.keepScreenAwake}
                  onCheckedChange={(checked) => update({ keepScreenAwake: checked })}
                  aria-label="Keep screen awake in Show Mode"
                />
              }
            />
          </div>
        </Panel>

        {userId ? (
          <MySolarisNotificationsPanel includeSpoilerFree={false} />
        ) : userId === null ? (
          <Panel
            className={app.isAppMode ? "solaris-app-settings-panel" : undefined}
            title="Notifications"
            description="Push categories and quiet hours are attached to your Solaris account."
          >
            <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/35 p-4">
              <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Sign in to manage notifications</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Spoiler-free mode above remains available on this device without signing in.
                </p>
              </div>
              <Link
                to="/auth"
                search={{ redirect: "/settings" }}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            </div>
          </Panel>
        ) : (
          <Panel className={app.isAppMode ? "solaris-app-settings-panel" : undefined} title="Notifications" description="Checking your Solaris notification settings…">
            <p className="text-sm text-muted-foreground">Loading account state…</p>
          </Panel>
        )}

        <Panel
          className={app.isAppMode ? "solaris-app-settings-panel" : undefined}
          title="Appearance & accessibility"
          description="Solaris follows system accessibility signals instead of hiding competing controls in five different menus."
        >
          <div className="solaris-app-settings-group grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={accessibility.reducedMotion ? MoonStar : Sun}
              label="Motion"
              value={accessibility.reducedMotion ? "Reduced motion" : "Standard motion"}
              description={
                accessibility.reducedMotion
                  ? "System Reduce Motion is respected across app transitions and loading states."
                  : "Animations remain enabled. Your system Reduce Motion setting can disable them."
              }
            />
            <StatusCard
              icon={MoonStar}
              label="Transparency"
              value={accessibility.reducedTransparency ? "Reduced transparency" : "Standard transparency"}
              description={
                accessibility.reducedTransparency
                  ? "System Reduce Transparency is respected by Liquid Glass and translucent app surfaces."
                  : "Solaris follows the system transparency preference where the browser exposes it."
              }
            />
          </div>
        </Panel>

        <Panel
          className={app.isAppMode ? "solaris-app-settings-panel" : undefined}
          title="Storage & offline"
          description="Public app assets may be cached for continuity. Official submissions are never queued as offline submissions."
        >
          <div className="solaris-app-settings-group grid gap-3 md:grid-cols-3">
            <StatusCard
              icon={Database}
              label="Browser storage in use"
              value={formatBytes(storage.usage)}
              description={
                storage.quota == null
                  ? "This browser does not expose its storage quota."
                  : "Browser quota: " + formatBytes(storage.quota) + "."
              }
            />
            <StatusCard
              icon={Database}
              label="Saved public data"
              value={offlineIndex ? String(offlineCount) + " items" : "No saved index"}
              description={
                offlineIndex
                  ? "Safe public edition, show and country metadata is available to the offline fallback."
                  : "Solaris rebuilds the safe public offline index during normal online use."
              }
            />
            <StatusCard
              icon={Smartphone}
              label="Offline behavior"
              value="Public shell only"
              description="Navigation can fall back to the offline shell. Confirmation, jury and televote submissions still require a live server."
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={clearing}
              onClick={() => void clearOffline()}
              className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold disabled:opacity-50"
            >
              {clearing ? "Clearing…" : "Clear cached public data"}
            </button>
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">
              This does not delete confirmation, jury or voting drafts, tab restoration, preferences or other local device state.
            </p>
          </div>
          {storageMessage ? (
            <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">
              {storageMessage}
            </p>
          ) : null}
        </Panel>

        <Panel className={app.isAppMode ? "solaris-app-settings-panel" : undefined} title="Install" description="How Solaris Studio is currently running on this device.">
          <div className="solaris-app-settings-group grid gap-3 sm:grid-cols-2">
            <StatusCard
              icon={Smartphone}
              label="Launch mode"
              value={app.isAppMode ? "Installed app" : "Browser"}
              description={
                app.isAppMode
                  ? "Standalone navigation, restoration and app lifecycle behavior are active."
                  : "Use Add to Home Screen or your browser install action to enable the standalone app experience."
              }
            />
            <StatusCard
              icon={BellRing}
              label="Device capabilities"
              value={app.canPush ? "Push supported" : "Push unavailable"}
              description={[
                app.canShare ? "native sharing" : "web sharing only",
                app.canBadge ? "app badges" : "no app badge API",
              ].join(" · ")}
            />
          </div>
        </Panel>

        <Panel
          className={app.isAppMode ? "solaris-app-settings-panel" : undefined}
          title="Privacy & app information"
          description="App diagnostics are deliberately narrow."
        >
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-2 text-xs leading-5 text-muted-foreground">
              <p>
                Solaris may record app lifecycle events such as successful tab restoration, resume, reconnect and push-open behavior so broken app flows can be found.
              </p>
              <p>
                Those app events do not include ballot contents, draft text, notification message bodies or other form contents.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function SettingRow({
  icon: Icon,
  title,
  description,
  control,
}: {
  icon: typeof EyeOff;
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="solaris-settings-row flex min-h-16 items-center gap-3 rounded-2xl border border-border/70 bg-background/35 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
      <span className="shrink-0">{control}</span>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof Info;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="solaris-settings-status rounded-2xl border border-border/70 bg-background/35 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <p className="text-[10px] font-black uppercase tracking-[0.13em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 text-sm font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}
