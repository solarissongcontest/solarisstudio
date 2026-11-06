import { useEffect, useRef } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

export function AppTelemetryBridge() {
  const { pathname } = useHydrationSafeRouterLocation();
  const { isAppMode, lifecycle, connectivity } = useSolarisApp();
  const screen = resolveSolarisAppScreen(pathname);
  const lastResume = useRef<string | null>(null);
  const previousConnectivity = useRef(connectivity.status);
  const pushTracked = useRef(false);

  useEffect(() => {
    if (!isAppMode || !lifecycle.lastResumeAt) return;
    if (lastResume.current === lifecycle.lastResumeAt) return;
    lastResume.current = lifecycle.lastResumeAt;

    trackPublicUxEvent("app_resumed", {
      target: pathname,
      metadata: {
        area: "app",
        source: "lifecycle",
        elapsed_ms: lifecycle.backgroundDurationMs,
      },
    });

    if (screen.behavior.criticalTask) {
      trackPublicUxEvent("app_task_resumed", {
        target: pathname,
        metadata: {
          area: screen.hierarchy.rootTab ?? "app",
          source: "resume",
          elapsed_ms: lifecycle.backgroundDurationMs,
        },
      });
    }
  }, [
    isAppMode,
    lifecycle.backgroundDurationMs,
    lifecycle.lastResumeAt,
    pathname,
    screen.behavior.criticalTask,
    screen.hierarchy.rootTab,
  ]);

  useEffect(() => {
    const previous = previousConnectivity.current;
    previousConnectivity.current = connectivity.status;
    if (!isAppMode || connectivity.status !== "online" || previous === "online") return;

    trackPublicUxEvent("app_offline_recovered", {
      target: pathname,
      metadata: {
        area: "app",
        source: previous,
      },
    });
  }, [connectivity.status, isAppMode, pathname]);

  useEffect(() => {
    if (!isAppMode || pushTracked.current || typeof window === "undefined") return;
    if (window.location.hash !== "#solaris-push-open") return;
    pushTracked.current = true;

    trackPublicUxEvent("app_push_opened", {
      target: pathname,
      metadata: {
        area: "app",
        source: "web_push",
      },
    });

    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }, [isAppMode, pathname]);

  return null;
}
