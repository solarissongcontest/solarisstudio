import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell, type V3Area } from "./V3AppShell";

/**
 * Transitional shell adapter for public routes whose canonical content/data
 * pipeline is already correct but whose route still owns the previous AppShell.
 *
 * This deliberately does not copy, refetch or reinterpret route data. The
 * existing child route remains the single content authority while installed V3
 * gets the canonical V3 chrome. Critical, immersive, auth and unsupported
 * routes continue to fail closed through decideV3ShellForRoute().
 */
export function V3LegacyRouteAdapter({
  children,
  phaseLabel,
}: {
  children: ReactNode;
  phaseLabel?: string;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  // Public web remains byte-for-byte on its established shell. During the
  // hydration-safe platform decision we also preserve the established route,
  // rather than replacing indexable public content with an app-only loader.
  if (!platformResolved || !isAppMode) return <>{children}</>;
  if (rollout.isLoading || rollout.isError || rollout.data?.enabled !== true) {
    return <>{children}</>;
  }

  const shell = decideV3ShellForRoute({
    pathname,
    search: searchStr,
    rolloutRule: { stage: "enabled" },
    rolloutContext: {
      userId: rollout.data.userId,
      editionId: rollout.data.editionId,
      // The persisted rollout probe already evaluated privileged rollout
      // policy. This adapter owns public shell selection only.
      isOrganizer: false,
    },
    isAuthenticated: Boolean(rollout.data.userId),
  });

  if (!shell.useV3Shell || !shell.rootTab) return <>{children}</>;

  return (
    <V3AppShell
      editionLabel="Solaris Studio"
      phaseLabel={phaseLabel}
      activeArea={shell.rootTab as V3Area}
    >
      <div data-v3-legacy-route-adapter="">
        <style>{`
          [data-v3-legacy-route-adapter] .solaris-app-toolbar,
          [data-v3-legacy-route-adapter] .solaris-app-tabbar,
          [data-v3-legacy-route-adapter] .solaris-app-bottom-spacer,
          [data-v3-legacy-route-adapter] .app-background {
            display: none !important;
          }

          [data-v3-legacy-route-adapter] .app-main {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          [data-v3-legacy-route-adapter] > .relative.isolate.min-h-screen {
            min-height: 0 !important;
            overflow: visible !important;
          }

          [data-v3-legacy-route-adapter] .app-main > * {
            min-width: 0;
          }
        `}</style>
        {children}
      </div>
    </V3AppShell>
  );
}
