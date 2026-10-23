import type { ReactNode } from "react";

import { V3AppShell, type V3Area } from "./V3AppShell";

export type V3LegacyRouteShellArea = V3Area;

/**
 * Heavy V3 chrome for legacy-content route families.
 *
 * Kept in its own dynamically imported module so routes that never enter the
 * installed V3 experience do not pay for navigation, command-palette and
 * attention dependencies in their initial client bundle.
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

          /* Preserve the established route's content measure, safe-area and
             bottom-obstruction spacing. Only duplicate chrome is removed. */
          [data-v3-legacy-route-adapter] .app-main {
            min-width: 0;
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
