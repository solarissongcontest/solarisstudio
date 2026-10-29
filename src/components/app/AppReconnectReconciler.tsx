import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { APP_CONNECTIVITY_RECOVERED_EVENT } from "@/lib/app-connectivity";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";

export function AppReconnectReconciler() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { pathname } = useHydrationSafeRouterLocation();
  const [showRecovered, setShowRecovered] = useState(false);
  const recoveredTimer = useRef<number | null>(null);

  useEffect(() => {
    const onRecovered = () => {
      setShowRecovered(true);
      if (recoveredTimer.current !== null) {
        window.clearTimeout(recoveredTimer.current);
      }
      recoveredTimer.current = window.setTimeout(() => {
        recoveredTimer.current = null;
        setShowRecovered(false);
      }, 2600);

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
      if (recoveredTimer.current !== null) {
        window.clearTimeout(recoveredTimer.current);
        recoveredTimer.current = null;
      }
    };
  }, [pathname, queryClient, router]);

  if (!showRecovered) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-solaris-app-reconnected=""
      className="fixed left-1/2 z-[75] flex w-[min(calc(100vw-1.5rem),32rem)] -translate-x-1/2 items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-950/90 px-3 py-2 text-[0.7rem] font-semibold text-emerald-100 shadow-xl"
      style={{
        top: "calc(env(safe-area-inset-top) + var(--solaris-app-toolbar-height) + .45rem)",
      }}
    >
      Back online · refreshing Solaris
    </div>
  );
}