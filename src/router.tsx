import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const QUERY_STALE_TIME_MS = 10_000;
const ROUTE_PRELOAD_STALE_TIME_MS = 30_000;

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Most Solaris data does not need to be fetched again just because the
        // same component remounted a moment later. Live views keep their own
        // polling/realtime settings and mutations still invalidate immediately.
        staleTime: QUERY_STALE_TIME_MS,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Avoid repeating route preload work on every hover/tap within a few seconds.
    defaultPreloadStaleTime: ROUTE_PRELOAD_STALE_TIME_MS,
  });

  return router;
};