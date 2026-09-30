import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppTabBar } from "@/components/app/AppTabBar";
import { useSolarisApp } from "@/components/app/AppRuntime";

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!isAppMode) return <>{children}</>;

  return (
    <div className="app-shell min-h-screen" data-solaris-app-route-state>
      <header className="solaris-app-toolbar">
        <div className="solaris-app-toolbar-inner">
          <h1 className="solaris-app-toolbar-title">{title}</h1>
        </div>
      </header>

      <main
        id="main-content"
        className="app-main relative z-10 mx-auto w-full min-w-0 px-4 py-6 sm:px-5"
        aria-busy={busy || undefined}
      >
        {children}
      </main>

      <AppTabBar pathname={pathname} signedIn={false} />
    </div>
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
