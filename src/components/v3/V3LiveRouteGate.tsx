import { useEffect, useState, type ReactNode } from "react";

import { Switch } from "@/components/ui/switch";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import type { V3PublicShowState } from "@/lib/v3-live";
import { useV3LiveBundle } from "@/lib/v3-live-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3FoundationShell, V3Screen, V3Surface } from "./V3Foundation";
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

const WAKE_STATES = new Set<V3PublicShowState>([
  "live",
  "paused",
  "delayed",
  "voting",
  "results_pending",
]);

function LiveBootSurface({ message }: { message: string }) {
  return (
    <V3FoundationShell>
      <V3Screen className="min-h-dvh">
        <V3Surface level="raised" className="p-5">
          <p className="v3-kicker">Live</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">Show Mode</h1>
          <p role="status" className="mt-2 text-sm text-white/55">
            {message}
          </p>
        </V3Surface>
      </V3Screen>
    </V3FoundationShell>
  );
}

function LiveUnavailableSurface({
  retrying,
  onRetry,
}: {
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <V3FoundationShell>
      <V3Screen className="min-h-dvh">
        <V3Surface
          level="raised"
          className="border-amber-300/20 bg-amber-300/[0.055] p-5"
          data-v3-live-initial-unavailable=""
        >
          <p className="v3-kicker">Live</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">
            Live state unavailable
          </h1>
          <p role="alert" className="mt-2 text-sm leading-6 text-white/55">
            Solaris could not verify the current public show state. V3 Live stays
            closed rather than switching to a different legacy data path.
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry Live state"}
          </button>
        </V3Surface>
      </V3Screen>
    </V3FoundationShell>
  );
}

/**
 * Reversible Public V3 Live cutover.
 *
 * Rollout authority is resolved before the legacy Show Mode subtree mounts, so
 * an enabled V3 session never launches the old archive-wide browser fan-out.
 * The V3 branch intentionally uses only the foundation shell: /show-mode is an
 * immersive route and must not acquire the normal five-tab application chrome.
 *
 * Once authoritative rollout + Live snapshots exist, later refetch/reconnect
 * failures keep those cached snapshots mounted in a visibly degraded state.
 * Falling back at that point would discard known-good server truth precisely
 * while connectivity is unreliable.
 */
export function V3LiveRouteGate({ fallback }: { fallback: ReactNode }) {
  const rollout = useV3RolloutProbe(true);
  const { preferences, update } = useAppExperiencePreferences();
  const [wakeActive, setWakeActive] = useState(false);
  const v3Enabled =
    rollout.data?.enabled === true &&
    rollout.data.liveEnabled === true;
  const bundle = useV3LiveBundle(v3Enabled);
  const liveState = bundle.data?.experience?.state ?? null;
  const wakeLockSupported =
    typeof navigator !== "undefined" &&
    Boolean((navigator as NavigatorWithWakeLock).wakeLock);
  const shouldWake = Boolean(
    v3Enabled &&
      wakeLockSupported &&
      preferences.keepScreenAwake &&
      liveState &&
      WAKE_STATES.has(liveState),
  );

  useEffect(() => {
    if (!shouldWake || typeof document === "undefined" || typeof navigator === "undefined") {
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

  if (rollout.isLoading && !rollout.data) {
    return <LiveBootSurface message="Checking the live experience…" />;
  }

  // A failed initial rollout read cannot safely opt the viewer into V3. A later
  // rollout refetch failure with cached data is different: keep using the last
  // authoritative server flag snapshot and mark the mounted V3 view degraded.
  if (!rollout.data || !v3Enabled) {
    return <>{fallback}</>;
  }

  if (bundle.isLoading && !bundle.data) {
    return <LiveBootSurface message="Opening authoritative show state…" />;
  }

  // Once rollout authority has positively selected V3, an unavailable initial
  // Live snapshot must not silently switch to the legacy archive-wide data path.
  // Keep the V3 authority boundary visible and retryable instead.
  if (!bundle.data) {
    return (
      <LiveUnavailableSurface
        retrying={bundle.isFetching}
        onRetry={() => {
          void bundle.refetch();
        }}
      />
    );
  }

  const degraded = rollout.isError || bundle.isError;
  const refreshing = rollout.isFetching || bundle.isFetching;

  return (
    <V3FoundationShell>
      <V3LiveScreen
        edition={bundle.data.edition}
        experience={bundle.data.experience}
        degraded={degraded}
        refreshing={refreshing}
        onRefresh={() => {
          void Promise.all([rollout.refetch(), bundle.refetch()]);
        }}
      />
      <div className="v3-screen pt-0" data-v3-live-settings="">
        <V3Surface className="flex min-h-16 items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Keep screen awake</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              {!wakeLockSupported
                ? "Screen Wake Lock is not available on this device."
                : wakeActive
                  ? "Screen Wake Lock is active while this show state needs it."
                  : "Use the existing Show Mode preference on active live states."}
            </p>
          </div>
          <Switch
            checked={preferences.keepScreenAwake}
            disabled={!wakeLockSupported}
            onCheckedChange={(checked) => update({ keepScreenAwake: checked })}
            aria-label="Keep screen awake in Show Mode"
          />
        </V3Surface>
      </div>
    </V3FoundationShell>
  );
}
