import { createContext, useContext, useCallback } from "react";
import { LIMITED_PUBLIC_LAUNCH, limitedPublicLaunchAllows, publicLaunchAllows, publicLaunchPath, type PublicLaunchFlags } from "./public-launch-availability";
import {
  GLOBAL_MAINTENANCE_MODE,
  isMaintenancePublicAccountRouteAllowed,
  isMaintenancePublicWebsiteRouteAllowed,
} from "./maintenance";

export type PublicLaunchAvailability = {
  active: boolean;
  flags: PublicLaunchFlags;
  checking: boolean;
  error: boolean;
  retry: () => void;
};
export const PublicLaunchContext = createContext<PublicLaunchAvailability>({
  active: false,
  flags: {},
  checking: false,
  error: false,
  retry: () => {},
});
export function usePublicLaunchAvailability() {
  const state = useContext(PublicLaunchContext);
  // Future full-V3 feature-flag policy remains independent of temporary P0
  // Worker maintenance gating. Existing consumers/tests rely on this contract.
  const allows = useCallback(
    (href: string) => !state.active || publicLaunchAllows(href, state.flags),
    [state.active, state.flags],
  );
  const allowsReleased = useCallback((href: string) => {
    // The restricted Worker gate also controls public links before the optional
    // availability provider mounts; Organizer's `allows` contract stays intact.
    if (LIMITED_PUBLIC_LAUNCH && !limitedPublicLaunchAllows(href)) return false;
    if (!allows(href)) return false;
    if (!GLOBAL_MAINTENANCE_MODE) return true;
    const path = publicLaunchPath(href);
    if (path === null) return false;

    // Mirror RootComponent's strictly disposable browser-audit exception.
    // A remote or hosted Supabase URL can NEVER bypass P0 navigation gating.
    const localDisposableSupabase =
      /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(String(import.meta.env.VITE_SUPABASE_URL || ""));
    const localDisposableBrowserAudit =
      localDisposableSupabase &&
      (typeof window === "undefined"
        ? process.env.SOLARIS_E2E_BYPASS_MAINTENANCE === "1"
        : window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
    if (localDisposableBrowserAudit) return true;

    return isMaintenancePublicWebsiteRouteAllowed(path, "GET", true) ||
      isMaintenancePublicAccountRouteAllowed(path, "GET", true);
  }, [allows]);
  return { ...state, allows, allowsReleased };
}
