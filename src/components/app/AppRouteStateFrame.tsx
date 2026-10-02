import type { ReactNode } from "react";

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

  if (!isAppMode) return <>{children}</>;

  return (
    <main
      id="main-content"
      className="app-main relative z-10 mx-auto w-full min-w-0 px-4 py-6 sm:px-5"
      aria-busy={busy || undefined}
      aria-label={title}
      data-solaris-app-route-state
    >
      {children}
    </main>
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
