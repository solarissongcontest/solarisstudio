import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { APP_CONNECTIVITY_RECOVERED_EVENT } from "@/lib/app-connectivity";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";

export function AppReconnectReconciler() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { pathname } = useHydrationSafeRouterLocation();

  useEffect(() => {
    let reconciliationTimer: number | null = null;

    const clearPendingReconciliation = () => {
      if (reconciliationTimer == null) return;
      window.clearTimeout(reconciliationTimer);
      reconciliationTimer = null;
    };

    const onRecovered = () => {
      const chrome = resolveAppRouteChrome(pathname);

      // Critical participation flows reconcile their own local/server drafts.
      // Never kick them with a global route refresh or replay a mutation.
      if (chrome.archetype === "task" || chrome.archetype === "immersive") {
        clearPendingReconciliation();
        return;
      }

      // Recovery events can cluster while the browser is re-establishing
      // connectivity. Keep one delayed reconciliation and make the eventual
      // callback re-check both connectivity and the route that actually owns
      // the UI at execution time. A user may enter a critical task, or the
      // network may drop again, during this small delay.
      clearPendingReconciliation();
      reconciliationTimer = window.setTimeout(() => {
        reconciliationTimer = null;
        if (!navigator.onLine) return;

        const currentChrome = resolveAppRouteChrome(
          window.location.pathname,
          window.location.search,
        );
        if (
          currentChrome.archetype === "task" ||
          currentChrome.archetype === "immersive"
        ) {
          return;
        }

        void queryClient.invalidateQueries({ refetchType: "active" });
        void router.invalidate();
      }, 150);
    };

    window.addEventListener(APP_CONNECTIVITY_RECOVERED_EVENT, onRecovered);
    window.addEventListener("offline", clearPendingReconciliation);
    return () => {
      window.removeEventListener(APP_CONNECTIVITY_RECOVERED_EVENT, onRecovered);
      window.removeEventListener("offline", clearPendingReconciliation);
      clearPendingReconciliation();
    };
  }, [pathname, queryClient, router]);

  return null;
}
