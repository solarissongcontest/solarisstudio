import { type ReactNode, useEffect, useRef, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { useV3LiveBundle } from "@/lib/v3-live-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import type { V3PublicShowState } from "@/lib/v3-live";
import { V3LiveScreen } from "./V3LiveScreen";

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

const WAKE_LOCK_STATES = new Set<V3PublicShowState>([
  "live",
  "voting",
  "results_pending",
]);

function ResolvingLiveSurface() {
  return (
    <main
      className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-8"
      data-v3-live-boot=""
    >
      <p className="v3-kicker">Solaris Live</p>
      <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">Opening Live Mode</h1>
      <p className="mt-2 text-sm text-white/50" role="status" aria-live="polite">
        Checking the authoritative public show state.
      </p>
    </main>
  );
}

/**
 * Reversible Public V3 Live route boundary.
 *
 * `/show-mode` is intentionally an immersive/minimal-chrome route, so this gate
 * never mounts V3AppShell. Web, disabled rollout, probe errors and snapshot
 * failures keep the proven legacy Show Mode unchanged.
 */
export function V3LiveRouteGate({ legacy }: { legacy: ReactNode }) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const v3Enabled =
    platformResolved &&
    isAppMode &&
    rollout.data?.enabled === true &&
    rollout.data?.liveEnabled === true;
  const live = useV3LiveBundle(v3Enabled);
  const { preferences, update } = useAppExperiencePreferences();
  const [wakeActive, setWakeActive] = useState(false);
  const lastTelemetryState = useRef("");

  const wakeLockSupported =
    typeof navigator !== "undefined" &&
    Boolean((navigator as NavigatorWithWakeLock).wakeLock);
  const shouldWake = Boolean(
    v3Enabled &&
      wakeLockSupported &&
      preferences.keepScreenAwake &&
      live.data?.experience &&
      WAKE_LOCK_STATES.has(live.data.experience.state),
  );

  useEffect(() => {
    if (!shouldWake || typeof document === "undefined") {
      setWakeActive(false);
      return;
    }

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const release = async () => {
      const current = sentinel;
      sentinel = null;
      if (current && !current.released) {
        await current.release().catch(() => undefined);
      }
      if (!cancelled) setWakeActive(false);
    };

    const request = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
        if (!wakeLock) return;
        sentinel = await wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        setWakeActive(true);
        sentinel.addEventListener?.("release", () => {
          if (!cancelled) setWakeActive(false);
        });
      } catch {
        if (!cancelled) setWakeActive(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
      else void release();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [shouldWake]);

  useEffect(() => {
    const experience = live.data?.experience;
    if (!v3Enabled || !experience) return;
    const key = `${experience.show.id}:${experience.freshness.stateVersion}`;
    if (lastTelemetryState.current === key) return;
    lastTelemetryState.current = key;
    trackPublicUxEvent("app_show_mode_state", {
      target: "/show-mode",
      metadata: {
        area: "results",
        source: "v3_live",
        interaction: experience.state,
      },
    });
  }, [live.data?.experience, v3Enabled]);

  if (!platformResolved) return <ResolvingLiveSurface />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingLiveSurface />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data.liveEnabled !== true
  ) {
    return <>{legacy}</>;
  }
  if (live.isLoading) return <ResolvingLiveSurface />;
  if (live.isError || !live.data) return <>{legacy}</>;

  return (
    <div data-v3-live-cutover="active" className="min-h-dvh">
      <V3LiveScreen
        experience={live.data.experience}
        onRefresh={() => void live.refetch()}
        refreshing={live.isFetching}
        spoilerFree={preferences.spoilerFree}
        onSpoilerFreeChange={(checked) => update({ spoilerFree: checked })}
        keepScreenAwake={preferences.keepScreenAwake}
        onKeepScreenAwakeChange={(checked) => update({ keepScreenAwake: checked })}
        wakeLockSupported={wakeLockSupported}
        wakeActive={wakeActive}
      />
    </div>
  );
}
