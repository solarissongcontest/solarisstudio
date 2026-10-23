import { QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { createRouter } from "@tanstack/react-router";
import {
  AppRouteSkeleton,
  AppRouteStateFrame,
  type AppRouteSkeletonVariant,
} from "@/components/app/AppRouteStateFrame";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
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

  // Critical-task and loading-shape ownership both come from the canonical
  // screen registry. Pending transitions must not maintain smaller hand-written
  // route lists or a second information architecture.
  const screen = pathname ? resolveSolarisAppScreen(pathname) : null;
  const criticalTask = screen?.behavior.criticalTask ?? false;
  const skeletonVariant: AppRouteSkeletonVariant =
    screen?.hierarchy.rootTab === "participate"
      ? "participant"
      : screen?.hierarchy.rootTab === "results"
        ? "results"
        : screen?.presentation === "entity"
          ? "entity"
          : "generic";

  // Nested Organizer loading belongs inside AdminFrame's existing landmark.
  // A second main during child-route transitions breaks keyboard/screen readers.
  if (pathname.startsWith("/admin") || pathname.startsWith("/confirmations/admin") || pathname.startsWith("/televoting/admin")) {
    return <section aria-busy="true" aria-label="Loading Organizer page"><AppRouteSkeleton /></section>;
  }

  if (isAppMode && criticalTask) {
    return (
      <section className="solaris-app-route-pending" aria-busy="true" aria-label="Loading">
        <AppRouteSkeleton variant={skeletonVariant} />
      </section>
    );
  }

  if (isAppMode) {
    return (
      <AppRouteStateFrame title="Loading" busy>
        <AppRouteSkeleton variant={skeletonVariant} />
      </AppRouteStateFrame>
    );
  }

  // Public-web route transitions use the same content-shaped skeleton instead
  // of shipping a second text-only loading treatment. It remains transient
  // status UI rather than claiming the destination's main/heading landmarks.
  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading page"
      role="status"
    >
      <AppRouteSkeleton variant={skeletonVariant} />
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