import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  clearAppLaunchTransaction,
  readAppLaunchTransaction,
  resolveAppLaunchSession,
} from "@/lib/app-launch-lifecycle";
import {
  appEntryHref,
  appTabForPath,
  getAppLaunchDestinationFromSnapshot,
  getAppLaunchSafeRootFromSnapshot,
  markAppNavigationRestore,
} from "@/lib/app-navigation";
import { beginLifecycleGeneration } from "@/lib/lifecycle-generation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";

/** The only owner of post-trampoline cold-launch restoration. */
export function AppLaunchRestoreCoordinator() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const generationRef = useRef(0);

  useEffect(() => {
    // The parsing-time trampoline owns /app-launch. Never interfere while its
    // replacement navigation is committing.
    if (pathname === "/app-launch") return;

    const transaction = readAppLaunchTransaction();
    if (!transaction) return;

    const safeRoot = getAppLaunchSafeRootFromSnapshot(transaction.navigationSnapshot);
    if (pathname !== "/" && pathname !== safeRoot.pathname) {
      clearAppLaunchTransaction();
      return;
    }

    const lifecycle = beginLifecycleGeneration(generationRef);
    void resolveAppLaunchSession(async () => {
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session?.user);
    }).then(({ signedIn, source }) => {
      if (!lifecycle.isCurrent()) return;

      const target =
        source === "timeout"
          ? safeRoot
          : getAppLaunchDestinationFromSnapshot(signedIn, transaction.navigationSnapshot);
      const targetHref = appEntryHref(target);

      try {
        void trackPublicUxEvent("app_cold_launch_restored", {
          target: targetHref,
          metadata: {
            area: appTabForPath(target.pathname) ?? "app",
            source:
              source === "timeout"
                ? "cold_launch_session_timeout"
                : source === "error"
                  ? "cold_launch_session_error"
                  : "cold_launch_local_session",
          },
        });
      } catch {
        // Telemetry is best effort and never owns navigation.
      }

      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (currentHref === targetHref) {
        clearAppLaunchTransaction();
        return;
      }

      markAppNavigationRestore(target);
      // Safe-root persistence already observed the pending marker and skipped
      // writing the temporary tab root over the captured destination.
      clearAppLaunchTransaction();
      window.location.replace(targetHref);
    });

    return () => lifecycle.deactivate();
  }, [pathname]);

  return null;
}
