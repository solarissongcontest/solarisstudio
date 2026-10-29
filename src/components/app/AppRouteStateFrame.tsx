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

export type AppRouteSkeletonVariant =
  | "generic"
  | "reference"
  | "notifications"
  | "article";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`solaris-app-route-skeleton-card ${className}`} />;
}

export function AppRouteSkeleton({
  variant = "generic",
  label = "Loading this view…",
}: {
  variant?: AppRouteSkeletonVariant;
  label?: string;
} = {}) {
  return (
    <div
      className="solaris-app-route-skeleton"
      role="status"
      aria-live="polite"
      data-v3-route-skeleton={variant}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {variant === "reference" ? (
          <>
            <div className="solaris-app-route-skeleton-line is-short" />
            <div className="solaris-app-route-skeleton-line mt-3 max-w-64" />
            <SkeletonBlock className="mt-5 !h-12" />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <SkeletonBlock className="is-compact !h-24" />
              <SkeletonBlock className="is-compact !h-24" />
              <SkeletonBlock className="is-compact !h-24" />
              <SkeletonBlock className="is-compact !h-24" />
            </div>
          </>
        ) : variant === "notifications" ? (
          <>
            <div className="solaris-app-route-skeleton-line is-short" />
            <SkeletonBlock className="mt-5 !h-28" />
            <div className="mt-5 overflow-hidden rounded-2xl border border-border/60">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex min-h-16 items-center gap-3 border-b border-border/50 p-3 last:border-b-0"
                >
                  <div className="solaris-app-route-skeleton-card !size-9 !min-h-9 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="solaris-app-route-skeleton-line !h-3 max-w-48" />
                    <div className="solaris-app-route-skeleton-line mt-2 !h-2.5 max-w-32" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : variant === "article" ? (
          <>
            <div className="solaris-app-route-skeleton-line is-short" />
            <div className="solaris-app-route-skeleton-line mt-3 max-w-72" />
            <div className="mt-6 space-y-3">
              <div className="solaris-app-route-skeleton-line max-w-full" />
              <div className="solaris-app-route-skeleton-line max-w-[92%]" />
              <div className="solaris-app-route-skeleton-line max-w-[84%]" />
              <div className="solaris-app-route-skeleton-line max-w-[96%]" />
              <div className="solaris-app-route-skeleton-line max-w-[68%]" />
            </div>
          </>
        ) : (
          <>
            <div className="solaris-app-route-skeleton-line is-short" />
            <SkeletonBlock />
            <SkeletonBlock className="is-compact" />
          </>
        )}
      </div>
    </div>
  );
}