import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { APP_RESUME_EVENT, type AppResumeDetail } from "@/lib/app-lifecycle";
import {
  freshnessLevelsForResume,
  type SolarisQueryFreshness,
} from "@/lib/app-query-policy";

export function AppDataFreshnessCoordinator() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onResume = (event: Event) => {
      const detail = (event as CustomEvent<AppResumeDetail>).detail;
      const duration = detail?.backgroundDurationMs ?? 0;
      const levels = new Set(freshnessLevelsForResume(duration));
      if (!levels.size) return;

      void queryClient.invalidateQueries({
        predicate: (query) => {
          const freshness = query.meta?.solarisFreshness as
            | SolarisQueryFreshness
            | undefined;
          return Boolean(freshness && levels.has(freshness));
        },
        refetchType: "active",
      });
    };

    window.addEventListener(APP_RESUME_EVENT, onResume);
    return () => window.removeEventListener(APP_RESUME_EVENT, onResume);
  }, [queryClient]);

  return null;
}
