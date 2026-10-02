import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
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

  // Route-state screens use the same AppShell as ordinary routes. They never
  // implement a second toolbar/tabbar or invent separate navigation state.
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
