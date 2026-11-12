import { createContext, useContext, useCallback } from "react";
import { publicLaunchAllows, type PublicLaunchFlags } from "./public-launch-availability";

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
    (href: string) => !state.active || publicLaunchAllows(href, state.flags),
    [state.active, state.flags],
  );
  return { ...state, allows };
}
