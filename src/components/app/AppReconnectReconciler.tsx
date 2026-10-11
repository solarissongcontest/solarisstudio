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
    const onRecovered = () => {
      const chrome = resolveAppRouteChrome(pathname);

      // Critical participation flows reconcile their own local/server drafts.
      // Never kick them with a global route refresh or replay a mutation.
      if (chrome.archetype === "task" || chrome.archetype === "immersive") return;

      window.setTimeout(() => {
        void queryClient.invalidateQueries({ refetchType: "active" });
        void router.invalidate();
      }, 150);
    };

    window.addEventListener(APP_CONNECTIVITY_RECOVERED_EVENT, onRecovered);
    return () => {
      window.removeEventListener(APP_CONNECTIVITY_RECOVERED_EVENT, onRecovered);
    };
  }, [pathname, queryClient, router]);

  return null;
}
