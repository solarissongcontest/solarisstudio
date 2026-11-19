import { createContext, useContext, useCallback } from "react";
import { publicLaunchAllows, publicLaunchPath, type PublicLaunchFlags } from "./public-launch-availability";
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
    if (!allows(href)) return false;
    if (!GLOBAL_MAINTENANCE_MODE) return true;
    const path = publicLaunchPath(href);
    if (path === null) return false;

    // Mirror RootComponent's strictly disposable browser-audit exception.
    // A remote or hosted Supabase URL can NEVER bypass P0 navigation gating.
    const localDisposableBrowserAudit =
      /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/.test(String(import.meta.env.VITE_SUPABASE_URL || "")) &&
      typeof window !== "undefined" &&
      (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
    if (localDisposableBrowserAudit) return true;

    return isMaintenancePublicWebsiteRouteAllowed(path, "GET", true) ||
      isMaintenancePublicAccountRouteAllowed(path, "GET", true);
  }, [allows]);
  return { ...state, allows, allowsReleased };
}
