import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { DelegationColourOverview } from "@/components/confirmations/DelegationColourOverview";
import { AdminFeatureBoundary } from "./AdminFeatureBoundary";
import { AdminNav } from "./AdminNav";
import { AdminSectionNav } from "./AdminSectionNav";

/**
 * Organizer content/layout frame.
 *
 * Mobile chrome ownership belongs to OrganizerV6MobileChrome in AdminShell.
 * The public AppShell already owns the document's single <main> landmark, so
 * this nested frame deliberately stays a plain layout container.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="admin-frame min-h-[calc(100vh-4rem)]">
      <aside className="admin-sidebar border-r border-white/[0.07]">
        <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto scroll-slim">
          <AdminFeatureBoundary
            name="desktop-navigation"
            fallback={
              <div className="p-3">
                <Link
                  to="/admin/operations"
                  className="admin-action-secondary w-full justify-start"
                >
                  Home
                </Link>
                <Link
                  to="/admin/menu"
                  className="admin-action-secondary mt-2 w-full justify-start"
                >
                  All Organizer tools
                </Link>
              </div>
            }
          >
            <AdminNav />
          </AdminFeatureBoundary>
        </div>
      </aside>

      <div className="admin-page admin-main min-w-0">
        <AdminFeatureBoundary
          name="section-navigation"
          fallback={
            <div className="mb-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3 text-xs">
              Section navigation could not load.{" "}
              <Link
                to="/admin/menu"
                className="font-semibold text-sky-100 underline"
              >
                Open all Organizer tools
              </Link>
              .
            </div>
          }
        >
          <AdminSectionNav />
        </AdminFeatureBoundary>
        {children}
        {pathname === "/confirmations/admin/countries" ? (
          <AdminFeatureBoundary name="delegation-colour-overview">
            <DelegationColourOverview />
          </AdminFeatureBoundary>
        ) : null}
      </div>
    </div>
  );
}
