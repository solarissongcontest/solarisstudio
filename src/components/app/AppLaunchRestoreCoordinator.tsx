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
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";
import { beginLifecycleGeneration } from "@/lib/lifecycle-generation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import {
  getRetainedAppLaunchCandidateFromSnapshot,
  getV3PublicLaunchDestination,
  markV3AppLaunchNavigationRestore,
  preferV3AppLaunchDestination,
} from "@/lib/v3-app-launch-memory";

/** The only owner of post-trampoline cold-launch restoration. */
export function AppLaunchRestoreCoordinator() {
  const { pathname } = useHydrationSafeRouterLocation();
  const generationRef = useRef(0);

  useEffect(() => {
    // The maintenance teaser preview is a fixture-only visual renderer. It must
    // never consume or mutate a pending installed-app launch transaction.
    if (pathname === "/terraos-teaser-preview") return;

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
    let localUserId: string | null = null;
    void resolveAppLaunchSession(async () => {
      const { data } = await supabase.auth.getSession();
      localUserId = data.session?.user?.id ?? null;
      return Boolean(localUserId);
    }).then(({ signedIn, source }) => {
      if (!lifecycle.isCurrent()) return;

      let memoryOwner: "safe_root" | "legacy" | "v3" = "safe_root";
      let target = safeRoot;

      if (source !== "timeout") {
        const legacyTarget = getAppLaunchDestinationFromSnapshot(
          signedIn,
          transaction.navigationSnapshot,
        );
        const legacyCandidate = getRetainedAppLaunchCandidateFromSnapshot(
          signedIn,
          transaction.navigationSnapshot,
        );
        const v3Target = getV3PublicLaunchDestination(
          signedIn,
          undefined,
          localUserId,
        );
        const useV3 = preferV3AppLaunchDestination(legacyCandidate, v3Target);

        target = useV3 && v3Target ? v3Target : legacyTarget;
        memoryOwner = useV3 ? "v3" : legacyCandidate ? "legacy" : "safe_root";
      }

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
            interaction: memoryOwner,
          },
        });
      } catch {
        // Telemetry is best effort and never owns navigation.
      }

      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (currentHref === targetHref) {
        clearAppLaunchTransaction();
        if (target.scrollY > 0) {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() =>
              window.scrollTo({ top: target.scrollY, behavior: "auto" }),
            );
          });
        }
        return;
      }

      // Arm both one-shot restore channels. The retained shell consumes the
      // legacy marker; V3 consumes the viewer-scoped marker. The V3 helper is
      // fail-closed for critical/immersive/auth-incompatible destinations.
      markAppNavigationRestore(target);
      markV3AppLaunchNavigationRestore(target, signedIn, undefined, localUserId);
      // Safe-root persistence observes the pending marker and must not overwrite
      // the destination captured before the cold-launch trampoline.
      clearAppLaunchTransaction();
      window.location.replace(targetHref);
    });

    return () => lifecycle.deactivate();
  }, [pathname]);

  return null;
}
