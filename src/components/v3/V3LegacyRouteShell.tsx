import type { ReactNode } from "react";

import { V3AppShell, type V3Area } from "./V3AppShell";

export type V3LegacyRouteShellArea = V3Area;

/**
 * V3 chrome and composition adapter for routes whose domain components still
 * live inside the legacy AppShell. The adapter deliberately does more than hide
 * duplicate chrome: it translates the old dashboard surface language into the
 * flatter V3 content hierarchy while routes are migrated incrementally.
 *
 * Physical safe areas belong exclusively to the outer V3 shell. The nested
 * AppShell must never reserve a second toolbar/tabbar runway.
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
          [data-v3-legacy-route-adapter] .app-background,
          [data-v3-legacy-route-adapter] .site-nav,
          [data-v3-legacy-route-adapter] .public-footer,
          [data-v3-legacy-route-adapter] .public-section-nav,
          [data-v3-legacy-route-adapter] .public-mobile-section-nav {
            display: none !important;
          }

          [data-v3-legacy-route-adapter] .app-main {
            min-width: 0;
            padding-top: 0 !important;
            padding-bottom: var(--v3-page-end-space, 28px) !important;
          }

          [data-v3-legacy-route-adapter] > .relative.isolate.min-h-screen {
            min-height: 0 !important;
            overflow: visible !important;
          }

          /* Legacy PageHeader becomes a compact editorial identity block. */
          [data-v3-legacy-route-adapter] .page-header {
            margin-bottom: 22px !important;
            padding-bottom: 18px !important;
            border-bottom-color: rgba(255,255,255,0.08) !important;
          }

          [data-v3-legacy-route-adapter] .page-header h1 {
            max-width: 18ch;
            font-size: clamp(1.9rem, 7vw, 2.75rem) !important;
            line-height: 0.99 !important;
            letter-spacing: -0.045em !important;
          }

          [data-v3-legacy-route-adapter] .page-header p {
            max-width: 42rem;
          }

          /* Default data panels stop behaving like dashboard cards. */
          [data-v3-legacy-route-adapter] .data-panel {
            border-radius: 0 !important;
            border-left: 0 !important;
            border-right: 0 !important;
            border-color: rgba(255,255,255,0.075) !important;
            background: transparent !important;
            box-shadow: none !important;
            padding: 16px 0 !important;
          }

          [data-v3-legacy-route-adapter] .data-panel + .data-panel {
            margin-top: 22px !important;
          }

          /* The remaining glass surface is for controls/media, not ordinary copy. */
          [data-v3-legacy-route-adapter] .glass:not([role="dialog"]):not([role="menu"]) {
            box-shadow: none;
          }

          /* Entity workspaces become one reading column on phone. Desktop may
           * keep its discovery rail, but it no longer visually boxes the body. */
          [data-v3-legacy-route-adapter] .solaris-app-entity-content {
            min-width: 0;
          }

          [data-v3-legacy-route-adapter] .solaris-app-entity-content > .data-panel:first-of-type {
            margin-top: 0 !important;
          }

          /* Generic card grids from V2 are flattened into section rhythm. */
          [data-v3-legacy-route-adapter] .data-panel .stat-line {
            background: transparent !important;
          }

          @media (max-width: 767px) {
            [data-v3-legacy-route-adapter] .solaris-app-entity-workspace {
              display: block !important;
            }

            [data-v3-legacy-route-adapter] .solaris-app-entity-sidebar {
              display: none !important;
            }

            [data-v3-legacy-route-adapter] .page-header {
              margin-bottom: 18px !important;
            }
          }
        `}</style>
        {children}
      </div>
    </V3AppShell>
  );
}
