import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { APP_CONNECTIVITY_RECOVERED_EVENT } from "@/lib/app-connectivity";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";

type ReconnectPhase = "idle" | "reconciling" | "restored";

const RESTORED_VISIBLE_MS = 2_400;

export function AppReconnectReconciler() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { pathname } = useHydrationSafeRouterLocation();
  const { isAppMode } = useSolarisApp();
  const [phase, setPhase] = useState<ReconnectPhase>("idle");

  useEffect(() => {
    let reconciliationTimer: number | null = null;
    let restoredTimer: number | null = null;
    let generation = 0;

    const clearPendingReconciliation = () => {
      if (reconciliationTimer == null) return;
      window.clearTimeout(reconciliationTimer);
      reconciliationTimer = null;
    };

    const clearRestoredTimer = () => {
      if (restoredTimer == null) return;
      window.clearTimeout(restoredTimer);
      restoredTimer = null;
    };

    const showRestored = (expectedGeneration: number) => {
      if (generation !== expectedGeneration || !navigator.onLine) return;
      clearRestoredTimer();
      setPhase("restored");
      restoredTimer = window.setTimeout(() => {
        if (generation === expectedGeneration) setPhase("idle");
        restoredTimer = null;
      }, RESTORED_VISIBLE_MS);
    };

    const onRecovered = () => {
      const recoveryGeneration = ++generation;
      clearPendingReconciliation();
      clearRestoredTimer();

      const chrome = resolveAppRouteChrome(pathname);

      // Critical participation flows reconcile their own local/server drafts.
      // Never kick them with a global route refresh or replay an operation.
      if (chrome.archetype === "task" || chrome.archetype === "immersive") {
        showRestored(recoveryGeneration);
        return;
      }

      setPhase("reconciling");

      // Recovery events can cluster while the browser is re-establishing
      // connectivity. Keep one delayed reconciliation and make the eventual
      // callback re-check both connectivity and the route that actually owns
      // the UI at execution time. A user may enter a critical task, or the
      // network may drop again, during this small delay.
      reconciliationTimer = window.setTimeout(() => {
        reconciliationTimer = null;
        if (generation !== recoveryGeneration || !navigator.onLine) return;

        const currentChrome = resolveAppRouteChrome(
          window.location.pathname,
          window.location.search,
        );
        if (
          currentChrome.archetype === "task" ||
          currentChrome.archetype === "immersive"
        ) {
          showRestored(recoveryGeneration);
          return;
        }

        void Promise.allSettled([
          queryClient.invalidateQueries({ refetchType: "active" }),
          router.invalidate(),
        ]).then(() => showRestored(recoveryGeneration));
      }, 150);
    };

    const onOffline = () => {
      generation += 1;
      clearPendingReconciliation();
      clearRestoredTimer();
      setPhase("idle");
    };

    window.addEventListener(APP_CONNECTIVITY_RECOVERED_EVENT, onRecovered);
    window.addEventListener("offline", onOffline);
    return () => {
      generation += 1;
      window.removeEventListener(APP_CONNECTIVITY_RECOVERED_EVENT, onRecovered);
      window.removeEventListener("offline", onOffline);
      clearPendingReconciliation();
      clearRestoredTimer();
    };
  }, [pathname, queryClient, router]);

  if (!isAppMode || phase === "idle") return null;

  const reconciling = phase === "reconciling";
  const Icon = reconciling ? RefreshCw : CheckCircle2;

  return (
    <div
      className="solaris-app-offline"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-solaris-app-reconnect={phase}
    >
      <Icon
        className={`size-4 shrink-0${reconciling ? " animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>
        {reconciling
          ? "Back online. Refreshing the latest Solaris state…"
          : "Connection restored."}
      </span>
    </div>
  );
}
