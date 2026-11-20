import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { APP_RESUME_EVENT, type AppResumeDetail } from "@/lib/app-lifecycle";
import {
  freshnessLevelsForResume,
  type SolarisQueryFreshness,
} from "@/lib/app-query-policy";

const BACKGROUND_REFRESH_FEEDBACK_DELAY_MS = 240;

export function AppDataFreshnessCoordinator() {
  const queryClient = useQueryClient();
  const { isAppMode } = useSolarisApp();
  const activeRefreshes = useRef(0);
  const feedbackTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const [showRefreshFeedback, setShowRefreshFeedback] = useState(false);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimer.current === null) return;
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = null;
  }, []);

  const runBackgroundRefresh = useCallback(
    async (
      predicate: NonNullable<
        Parameters<typeof queryClient.invalidateQueries>[0]
      >["predicate"],
    ) => {
      activeRefreshes.current += 1;

      if (activeRefreshes.current === 1) {
        clearFeedbackTimer();
        feedbackTimer.current = window.setTimeout(() => {
          feedbackTimer.current = null;
          if (mounted.current && activeRefreshes.current > 0) {
            setShowRefreshFeedback(true);
          }
        }, BACKGROUND_REFRESH_FEEDBACK_DELAY_MS);
      }

      try {
        await queryClient.invalidateQueries({
          predicate,
          refetchType: "active",
        });
      } finally {
        activeRefreshes.current = Math.max(0, activeRefreshes.current - 1);
        if (activeRefreshes.current === 0) {
          clearFeedbackTimer();
          if (mounted.current) setShowRefreshFeedback(false);
        }
      }
    },
    [clearFeedbackTimer, queryClient],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearFeedbackTimer();
    };
  }, [clearFeedbackTimer]);

  useEffect(() => {
    const onResume = (event: Event) => {
      if (!isAppMode) return;
      const detail = (event as CustomEvent<AppResumeDetail>).detail;
      const duration = detail?.backgroundDurationMs ?? 0;
      const levels = new Set(freshnessLevelsForResume(duration));
      if (!levels.size) return;

      void runBackgroundRefresh((query) => {
        const freshness =
          (query.meta?.solarisFreshness as SolarisQueryFreshness | undefined) ??
          "warm";
        return levels.has(freshness);
      });
    };

    window.addEventListener(APP_RESUME_EVENT, onResume);
    return () => window.removeEventListener(APP_RESUME_EVENT, onResume);
  }, [isAppMode, runBackgroundRefresh]);

  // Connectivity recovery is intentionally owned by AppReconnectReconciler.
  // Keeping resume freshness and reconnect reconciliation separate prevents one
  // physical recovery from triggering two global active-query refetch passes.
  if (!isAppMode || !showRefreshFeedback) return null;

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm"
      data-solaris-background-refresh="true"
      role="status"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
      Updating…
    </div>
  );
}
