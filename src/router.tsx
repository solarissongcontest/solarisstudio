import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { AppFallbackScreen } from "./components/app/AppFallbackScreen";
import { routeTree } from "./routeTree.gen";

function RoutePending() {
  return (
    <AppFallbackScreen
      kind="pending"
      title="Loading page…"
      description="Preparing the Solaris view."
      busy
    />
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Most Solaris data does not need to be downloaded again every time a
        // visitor changes page or returns to the tab. Explicit live surfaces,
        // mutations and targeted invalidations still refresh when necessary.
        staleTime: 2 * 60 * 1000,
        gcTime: 15 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 60_000,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
