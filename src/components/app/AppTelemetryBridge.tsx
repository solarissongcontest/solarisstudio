import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

const TASK_ROUTE = /^\/(confirmations|jury-voting|televoting|next-in-line)(\/|$)/;

export function AppTelemetryBridge() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAppMode, lifecycle, connectivity } = useSolarisApp();
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

    if (TASK_ROUTE.test(pathname)) {
      trackPublicUxEvent("app_task_resumed", {
        target: pathname,
        metadata: {
          area: "participate",
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
