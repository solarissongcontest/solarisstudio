import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { supabase } from "@/integrations/supabase/client";
import {
  appEntryHref,
  appTabForPath,
  getAppLaunchDestination,
  markAppNavigationRestore,
} from "@/lib/app-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

const APP_LAUNCH_SESSION_TIMEOUT_MS = 1_500;
const APP_LAUNCH_HARD_EXIT_MS = 2_500;

type AppLaunchSessionResolution = {
  signedIn: boolean;
  source: "local_session" | "timeout" | "error";
};

async function resolveAppLaunchSession(): Promise<AppLaunchSessionResolution> {
  let timeoutId: number | null = null;

  const timeout = new Promise<AppLaunchSessionResolution>((resolve) => {
    timeoutId = window.setTimeout(
      () => resolve({ signedIn: false, source: "timeout" }),
      APP_LAUNCH_SESSION_TIMEOUT_MS,
    );
  });

  const session = supabase.auth
    .getSession()
    .then(({ data }) => ({
      signedIn: Boolean(data.session?.user),
      source: "local_session" as const,
    }))
    .catch(() => ({
      signedIn: false,
      source: "error" as const,
    }));

  const result = await Promise.race([session, timeout]);
  if (timeoutId !== null) window.clearTimeout(timeoutId);
  return result;
}

export const Route = createFileRoute("/app-launch")({
  head: () => ({
    meta: [
      { title: "Opening Solaris Studio…" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppLaunchPage,
});

function leaveLaunchRoute(targetHref: string) {
  if (window.location.pathname !== "/app-launch") return;
  window.location.replace(targetHref);
}

function AppLaunchPage() {
  const { isAppMode } = useSolarisApp();

  useEffect(() => {
    let alive = true;

    // /app-launch is an intermediary, never a stable screen. Keep this browser-
    // level watchdog independent from auth, router state and telemetry so a
    // stalled dependency cannot strand an installed PWA on the launch page.
    const hardExitId = window.setTimeout(() => {
      if (alive) leaveLaunchRoute("/");
    }, APP_LAUNCH_HARD_EXIT_MS);

    if (!isAppMode) {
      leaveLaunchRoute("/");
      return () => {
        alive = false;
        window.clearTimeout(hardExitId);
      };
    }

    void resolveAppLaunchSession().then(({ signedIn, source }) => {
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

      // Analytics must never gate the user-visible launch transition.
      try {
        trackPublicUxEvent("app_cold_launch_restored", {
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
      window.clearTimeout(hardExitId);
      leaveLaunchRoute(targetHref);
    });

    return () => {
      alive = false;
      window.clearTimeout(hardExitId);
    };
  }, [isAppMode]);

  return (
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
  );
}
