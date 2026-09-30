import { QueryClient } from "@tanstack/react-query";
import { createRouter, useRouterState } from "@tanstack/react-router";
import { AppRouteSkeleton, AppRouteStateFrame } from "@/components/app/AppRouteStateFrame";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { solarisQueryPolicy } from "@/lib/app-query-policy";
import { routeTree } from "./routeTree.gen";

function RoutePending() {
  const { isAppMode } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const alreadyInsideParticipationChrome =
    pathname.startsWith("/confirmations") || pathname.startsWith("/televoting");

  if (isAppMode && alreadyInsideParticipationChrome) {
    return (
      <section className="solaris-app-route-pending" aria-busy="true" aria-label="Loading">
        <AppRouteSkeleton />
      </section>
    );
  }

  if (isAppMode) {
    return (
      <AppRouteStateFrame title="Loading" busy>
        <AppRouteSkeleton />
      </AppRouteStateFrame>
    );
  }

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
        // Warm is the default. Individual live or archival queries opt into a
        // stricter policy rather than every screen refetching on every focus.
        ...solarisQueryPolicy("warm"),
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 60_000,
    defaultPendingComponent: RoutePending,
  });

  return router;
};
