import { useEffect, useState, type ReactNode } from "react";

import { RefreshCcw } from "lucide-react";

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

function LiveBootSurface({
  message,
  onRetry,
  refreshing = false,
}: {
  message: string;
  onRetry?: () => void;
  refreshing?: boolean;
}) {
  return (
    <V3FoundationShell>
      <V3Screen className="min-h-dvh">
        <V3Surface level="raised" className="p-5">
          <p className="v3-kicker">Live</p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em]">Show Mode</h1>
          <p role="status" className="mt-2 text-sm text-white/55">
            {message}
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={refreshing}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-wait disabled:opacity-50"
            >
              <RefreshCcw
                aria-hidden="true"
                className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`}
              />
              {refreshing ? "Retrying Live…" : "Retry Live"}
            </button>
          ) : null}
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

  // A failed initial rollout probe cannot authorize either V3 or legacy. Do
  // not mount legacy's archive-wide readers just because the network failed.
  // Once a snapshot exists, later refetch errors preserve that cached authority.
  if (rollout.isError && !rollout.data) {
    return (
      <LiveBootSurface
        message="Couldn't verify the Live experience. Retry to check the current show state."
        onRetry={() => { void rollout.refetch(); }}
        refreshing={rollout.isFetching}
      />
    );
  }
  // A confirmed server-disabled rollout may use legacy; an absent rollout
  // snapshot is unknown authority and must not launch archive-wide queries.
  if (!rollout.data) {
    return (
      <LiveBootSurface
        message="Official Live rollout state could not be verified. Retry to check availability."
        onRetry={() => { void rollout.refetch(); }}
        refreshing={rollout.isFetching}
      />
    );
  }
  if (!v3Enabled) {
    return <>{fallback}</>;
  }

  if (bundle.isLoading && !bundle.data) {
    return <LiveBootSurface message="Opening authoritative show state…" />;
  }

  // An actual failed initial Live read is an error, not a rollout decision:
  // present a bounded manual retry instead of mounting legacy archive queries.
  if (bundle.isError && !bundle.data) {
    return (
      <LiveBootSurface
        message="Couldn't load the official Live snapshot. Retry to reconnect to show information."
        onRetry={() => { void bundle.refetch(); }}
        refreshing={bundle.isFetching}
      />
    );
  }

  // A missing first snapshot while the server explicitly enables V3 does not
  // authorize archive-wide legacy queries. Keep the read boundary fail-closed.
  // Legitimate empty show state is represented inside an authoritative bundle.
  if (!bundle.data) {
    return (
      <LiveBootSurface
        message="Official Live state could not be verified. Retry to check the current show."
        onRetry={() => { void bundle.refetch(); }}
        refreshing={bundle.isFetching}
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
