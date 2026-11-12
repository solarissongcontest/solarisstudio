import { createContext, useContext, useCallback } from "react";
import { publicLaunchAllows, type PublicLaunchFlags } from "./public-launch-availability";

export type PublicLaunchAvailability = {
  flags: PublicLaunchFlags;
  checking: boolean;
  error: boolean;
  retry: () => void;
};
export const PublicLaunchContext = createContext<PublicLaunchAvailability>({
  flags: {},
  checking: false,
  error: false,
  retry: () => {},
});
export function usePublicLaunchAvailability() {
  const state = useContext(PublicLaunchContext);
  const allows = useCallback(
    (href: string) => publicLaunchAllows(href, state.flags),
    [state.flags],
  );
  return { ...state, allows };
}
