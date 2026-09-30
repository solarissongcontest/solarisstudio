import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { APP_RESUME_EVENT, type AppResumeDetail } from "@/lib/app-lifecycle";
import {
  freshnessLevelsForResume,
  type SolarisQueryFreshness,
} from "@/lib/app-query-policy";

export function AppDataFreshnessCoordinator() {
  const queryClient = useQueryClient();
  const { isAppMode, connectivity } = useSolarisApp();
  const previousConnectivity = useRef(connectivity.status);

  useEffect(() => {
    const onResume = (event: Event) => {
      if (!isAppMode) return;
      const detail = (event as CustomEvent<AppResumeDetail>).detail;
      const duration = detail?.backgroundDurationMs ?? 0;
      const levels = new Set(freshnessLevelsForResume(duration));
      if (!levels.size) return;

      void queryClient.invalidateQueries({
        predicate: (query) => {
          const freshness =
            (query.meta?.solarisFreshness as SolarisQueryFreshness | undefined) ??
            "warm";
          return levels.has(freshness);
        },
        refetchType: "active",
      });
    };

    window.addEventListener(APP_RESUME_EVENT, onResume);
    return () => window.removeEventListener(APP_RESUME_EVENT, onResume);
  }, [isAppMode, queryClient]);

  useEffect(() => {
    const previous = previousConnectivity.current;
    previousConnectivity.current = connectivity.status;
    if (!isAppMode || connectivity.status !== "online" || previous === "online") return;

    void queryClient.invalidateQueries({
      predicate: (query) => {
        const freshness =
          (query.meta?.solarisFreshness as SolarisQueryFreshness | undefined) ??
          "warm";
        return freshness !== "cold";
      },
      refetchType: "active",
    });
  }, [connectivity.status, isAppMode, queryClient]);

  return null;
}
