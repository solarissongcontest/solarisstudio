import { createFileRoute, ScriptOnce } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_LAUNCH_ABSOLUTE_ESCAPE_MS,
  resolveAppLaunchSession,
} from "@/lib/app-launch-lifecycle";
import {
  appEntryHref,
  appTabForPath,
  getAppLaunchDestination,
  markAppNavigationRestore,
} from "@/lib/app-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

const APP_LAUNCH_BOOTSTRAP_SCRIPT = `(() => {
  try {
    if (window.location.pathname !== "/app-launch") return;
    const startedKey = "__solarisAppLaunchStartedAt";
    const timerKey = "__solarisAppLaunchEscapeTimer";
    const existingStarted = Number(window[startedKey]);
    const startedAt = Number.isFinite(existingStarted) && existingStarted > 0
      ? existingStarted
      : Date.now();
    window[startedKey] = startedAt;

    const existingTimer = Number(window[timerKey]);
    if (Number.isFinite(existingTimer) && existingTimer > 0) {
      window.clearTimeout(existingTimer);
    }

    const leave = () => {
      if (window.location.pathname === "/app-launch") {
        window.location.replace("/");
      }
    };
    const remaining = Math.max(0, ${APP_LAUNCH_ABSOLUTE_ESCAPE_MS} - (Date.now() - startedAt));
    window[timerKey] = window.setTimeout(leave, remaining);
  } catch {
    if (window.location.pathname === "/app-launch") window.location.replace("/");
  }
})();`;

export const Route = createFileRoute("/app-launch")({
  head: () => ({
    meta: [
      { title: "Opening Solaris Studio…" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppLaunchPage,
});

function clearPreHydrationEscape() {
  const launchWindow = window as Window & {
    __solarisAppLaunchEscapeTimer?: number;
    __solarisAppLaunchStartedAt?: number;
  };
  if (typeof launchWindow.__solarisAppLaunchEscapeTimer === "number") {
    window.clearTimeout(launchWindow.__solarisAppLaunchEscapeTimer);
  }
  delete launchWindow.__solarisAppLaunchEscapeTimer;
  delete launchWindow.__solarisAppLaunchStartedAt;
}

function leaveLaunchRoute(targetHref: string) {
  if (window.location.pathname !== "/app-launch") return;
  clearPreHydrationEscape();
  window.location.replace(targetHref);
}

function AppLaunchPage() {
  const { isAppMode } = useSolarisApp();

  useEffect(() => {
    let alive = true;

    if (!isAppMode) {
      leaveLaunchRoute("/");
      return () => {
        alive = false;
      };
    }

    void resolveAppLaunchSession(async () => {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session?.user);
    }).then(({ signedIn, source }) => {
      if (!alive) return;

      const target =
        source === "timeout"
          ? {
              pathname: "/",
              searchStr: "",
              scrollY: 0,
              visitedAt: new Date().toISOString(),
            }
          : getAppLaunchDestination(signedIn);
      const targetHref = appEntryHref(target);

      // Analytics is best-effort and deliberately synchronous from the launch
      // controller's perspective. A telemetry promise/network stall is never
      // awaited and therefore cannot gate navigation.
      try {
        void trackPublicUxEvent("app_cold_launch_restored", {
          target: targetHref,
          metadata: {
            area: appTabForPath(target.pathname) ?? "app",
            source:
              source === "timeout"
                ? "cold_launch_session_timeout"
                : source === "error"
                  ? "cold_launch_session_error"
                  : "cold_launch_local_session",
          },
        });
      } catch {
        // Best-effort telemetry only.
      }

      markAppNavigationRestore(target);
      leaveLaunchRoute(targetHref);
    });

    return () => {
      alive = false;
      // Do not cancel the pre-hydration escape here. React can intentionally
      // remount routes in development and during recovery; the absolute browser
      // deadline is specifically what survives those lifecycle transitions.
    };
  }, [isAppMode]);

  return (
    <>
      {/* ScriptOnce is server-rendered and executes while the browser parses the
          document, before React hydration. The launch escape therefore remains
          available even when the application bundle or hydration stalls. */}
      <ScriptOnce>{APP_LAUNCH_BOOTSTRAP_SCRIPT}</ScriptOnce>
      <main
        id="main-content"
        className="grid min-h-[100svh] place-items-center bg-background px-6 text-center"
        aria-busy="true"
        aria-live="polite"
      >
        <div>
          <img
            src="/icon-192.png?v=img2340-20260929"
            alt=""
            className="mx-auto size-20 rounded-[1.35rem]"
          />
          <p className="mt-5 text-[10px] font-black uppercase tracking-[.16em] text-primary">
            Solaris Studio
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-.03em]">Opening your app…</h1>
          <div
            className="mx-auto mt-5 h-1 w-28 overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
          >
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      </main>
    </>
  );
}
