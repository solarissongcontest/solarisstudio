import type { ReactNode } from "react";

import { V3AppShell, type V3Area } from "./V3AppShell";

export type V3LegacyRouteShellArea = V3Area;

/**
 * Heavy V3 chrome for legacy-content route families.
 *
 * The outer V3 shell owns physical safe areas and bottom-navigation clearance.
 * The nested legacy AppShell remains a content adapter only: its duplicate
 * toolbar/tabbar/background and old tabbar runway are removed here so routes do
 * not accidentally reserve system geometry twice.
 */
export function V3LegacyRouteShell({
  children,
  phaseLabel,
  activeArea,
}: {
  children: ReactNode;
  phaseLabel?: string;
  activeArea: V3LegacyRouteShellArea;
}) {
  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel={phaseLabel} activeArea={activeArea}>
      <div data-v3-legacy-route-adapter="">
        <style>{`
          [data-v3-legacy-route-adapter] .solaris-app-toolbar,
          [data-v3-legacy-route-adapter] .solaris-app-tabbar,
          [data-v3-legacy-route-adapter] .solaris-app-bottom-spacer,
          [data-v3-legacy-route-adapter] .app-background {
            display: none !important;
          }

          [data-v3-legacy-route-adapter] .app-main {
            min-width: 0;
            padding-bottom: var(--v3-page-end-space, 28px) !important;
          }

          [data-v3-legacy-route-adapter] > .relative.isolate.min-h-screen {
            min-height: 0 !important;
            overflow: visible !important;
          }
        `}</style>
        {children}
      </div>
    </V3AppShell>
  );
}
