import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export type HydrationSafeRouterLocation = {
  pathname: string;
  searchStr: string;
};

/**
 * Reads the router's current location synchronously without subscribing during
 * render, then starts listening only after React has committed the component.
 *
 * React 19 can report a pre-mount state update when TanStack Router publishes a
 * store change while a cold lazy route is resolving between render and commit.
 * Root-level runtime services must use this hook instead of useRouterState so
 * no router-store subscription exists during that hydration window.
 */
export function useHydrationSafeRouterLocation(): HydrationSafeRouterLocation {
  const router = useRouter();
  const [location, setLocation] = useState<HydrationSafeRouterLocation>(() => ({
    pathname: router.state.location.pathname,
    searchStr: router.state.location.searchStr,
  }));

  useEffect(() => {
    let active = true;

    const commit = (next = router.state.location) => {
      if (!active) return;
      setLocation((current) => {
        const pathname = next.pathname;
        const searchStr = next.searchStr;
        return current.pathname === pathname && current.searchStr === searchStr
          ? current
          : { pathname, searchStr };
      });
    };

    // Reconcile once after mount in case navigation resolved between render and
    // this effect, then observe only fully resolved future locations.
    commit();
    const unsubscribe = router.subscribe("onResolved", ({ toLocation }) => {
      commit(toLocation);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  return location;
}
