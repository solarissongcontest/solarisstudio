import { QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createRouter } from "@tanstack/react-router";
import { AppRouteSkeleton, AppRouteStateFrame } from "@/components/app/AppRouteStateFrame";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { solarisQueryPolicy } from "@/lib/app-query-policy";
import { routeTree } from "./routeTree.gen";

function RoutePending() {
  const { isAppMode } = useSolarisApp();
  // Pending UI sits inside TanStack Router's transition machinery. Subscribing
  // to router state from this transient boundary can receive a store update
  // before React has committed the pending component, which React 19 correctly
  // reports as a pre-mount state update. Reading window during render is also
  // unsafe for hydration because SSR has no browser pathname. Start from the
  // same deterministic value on server and client, then specialize after mount.
  const [pathname, setPathname] = useState("");
  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);
  const alreadyInsideParticipationChrome =
    pathname.startsWith("/confirmations") || pathname.startsWith("/televoting");

  // Nested Organizer loading belongs inside AdminFrame's existing landmark.
  // A second main during child-route transitions breaks keyboard/screen readers.
  if (pathname.startsWith("/admin") || pathname.startsWith("/confirmations/admin") || pathname.startsWith("/televoting/admin")) {
    return <section aria-busy="true" aria-label="Loading Organizer page"><AppRouteSkeleton /></section>;
  }

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

  // A pending route is transient transition UI, not the destination page.
  // TanStack can briefly keep more than one pending boundary mounted while a
  // route tree settles. Giving those boundaries <main> / <h1> semantics would
  // create duplicate page landmarks and let audits mistake loading UI for the
  // actual destination. Keep the status accessible without claiming ownership
  // of the document's page landmark or primary heading.
  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading page"
      role="status"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
        Solaris Studio
      </p>
      <p className="mt-1 font-display text-2xl font-bold">Loading page…</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Preparing the published Solaris view.
      </p>
    </section>
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
