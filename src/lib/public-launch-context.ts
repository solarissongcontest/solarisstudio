import { createContext, useContext, useCallback } from "react";
import { publicLaunchAllows, publicLaunchPath, type PublicLaunchFlags } from "./public-launch-availability";
import { GLOBAL_MAINTENANCE_MODE, isMaintenancePublicWebsiteRouteAllowed } from "./maintenance";

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
  const allows = useCallback(
    (href: string) => {
      const path = publicLaunchPath(href);
      if (path === null) return false;
      // Public navigation, global search and directory must share the exact
      // Worker GET allowlist during P0, not merely the future rollout flags.
      if (GLOBAL_MAINTENANCE_MODE && !isMaintenancePublicWebsiteRouteAllowed(path, "GET", true)) return false;
      return !state.active || publicLaunchAllows(href, state.flags);
    },
    [state.active, state.flags],
  );
  return { ...state, allows };
}
