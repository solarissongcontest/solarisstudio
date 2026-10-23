import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { APP_RESUME_EVENT, type AppResumeDetail } from "@/lib/app-lifecycle";
import {
  freshnessLevelsForResume,
  type SolarisQueryFreshness,
} from "@/lib/app-query-policy";

export function AppDataFreshnessCoordinator() {
  const queryClient = useQueryClient();
  const { isAppMode } = useSolarisApp();

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

  // Connectivity recovery is intentionally owned by AppReconnectReconciler.
  // Keeping resume freshness and reconnect reconciliation separate prevents one
  // physical recovery from triggering two global active-query refetch passes.
  return null;
}
