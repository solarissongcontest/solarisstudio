import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";

function organizerRoute(pathname: string) {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin")
  );
}

export function shouldOwnCriticalRouteStateFrame(pathname: string, searchStr = "") {
  if (organizerRoute(pathname)) return false;
  return resolveSolarisAppScreen(pathname, searchStr).behavior.criticalTask;
}

export function AppRouteStateFrame({
  title,
  children,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
}) {
  const { isAppMode } = useSolarisApp();
  const { pathname, searchStr } = useHydrationSafeRouterLocation();

  if (!isAppMode) return <>{children}</>;

  // Critical participant work owns its recovery surface just as it owns its
  // pending surface. Mounting the generic AppShell here would reintroduce its
  // toolbar/workspace/tab-bar machinery while a focused task is failing or a
  // stale deep link is being recovered. Keep one document main and no second
  // route map: the canonical screen registry decides whether the route is
  // critical. Organizer/service-admin routes retain their own error boundary.
  if (shouldOwnCriticalRouteStateFrame(pathname, searchStr)) {
    const screen = resolveSolarisAppScreen(pathname, searchStr);
    return (
      <main
        className="app-main relative z-10 mx-auto w-full min-w-0 px-3 pb-10 pt-4 sm:px-5 sm:pt-6"
        data-solaris-app-mode="true"
        data-solaris-app-critical-task="true"
        data-solaris-screen-id={screen.id}
        data-v3-critical-route-state={screen.id}
      >
        <div
          aria-busy={busy || undefined}
          aria-label={title}
          data-solaris-app-route-state
        >
          {children}
        </div>
      </main>
    );
  }

  // Ordinary route-state screens use the same AppShell as ordinary routes.
  // They never implement a second toolbar/tabbar or invent navigation state.
  return (
    <AppShell>
      <div
        aria-busy={busy || undefined}
        aria-label={title}
        data-solaris-app-route-state
      >
        {children}
      </div>
    </AppShell>
  );
}

export function AppRouteSkeleton() {
  return (
    <div className="solaris-app-route-skeleton" aria-hidden="true">
      <div className="solaris-app-route-skeleton-line is-short" />
      <div className="solaris-app-route-skeleton-card" />
      <div className="solaris-app-route-skeleton-card is-compact" />
    </div>
  );
}
