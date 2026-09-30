import { useQueryClient, type Query } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  freshnessLevelsForResume,
  type SolarisQueryFreshness,
} from "@/lib/app-query-policy";

function queryFreshness(query: Query): SolarisQueryFreshness {
  const value = (query.meta as { solarisFreshness?: unknown } | undefined)?.solarisFreshness;
  return value === "live" || value === "cold" || value === "warm" ? value : "warm";
}

export function AppFreshnessController() {
  const queryClient = useQueryClient();
  const { isAppMode, lifecycle, connectivity } = useSolarisApp();
  const lastResume = useRef<string | null>(null);
  const previousConnectivity = useRef(connectivity.status);

  useEffect(() => {
    if (!isAppMode || !lifecycle.lastResumeAt) return;
    if (lastResume.current === lifecycle.lastResumeAt) return;
    lastResume.current = lifecycle.lastResumeAt;

    const levels = freshnessLevelsForResume(lifecycle.backgroundDurationMs);
    if (!levels.length) return;

    void queryClient.refetchQueries({
      type: "active",
      predicate: (query) => levels.includes(queryFreshness(query)),
    });
  }, [
    isAppMode,
    lifecycle.backgroundDurationMs,
    lifecycle.lastResumeAt,
    queryClient,
  ]);

  useEffect(() => {
    const previous = previousConnectivity.current;
    previousConnectivity.current = connectivity.status;
    if (!isAppMode || connectivity.status !== "online" || previous === "online") return;

    void queryClient.refetchQueries({
      type: "active",
      predicate: (query) => queryFreshness(query) !== "cold",
    });
  }, [connectivity.status, isAppMode, queryClient]);

  return null;
}
