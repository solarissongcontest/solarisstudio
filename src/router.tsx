import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function RoutePending() {
  return (
    <main
      id="main-content"
      className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6"
      aria-busy="true"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        Solaris Studio
      </p>
      <h1 className="mt-1 font-display text-2xl font-bold">Loading page…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Preparing the published Solaris view.
      </p>
    </main>
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
