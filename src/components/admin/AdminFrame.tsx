import { Link, useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  ShieldAlert,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { AdminNav } from "./AdminNav";
import { useAdminContext } from "./AdminContext";

type MobileItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition = editions.find((edition) => edition.id === editionId) ?? editions[0] ?? null;
  const editionHref = activeEdition ? `/admin/${activeEdition.slug}` : "/admin";
  const isEditionWorkspace = editions.some((edition) => pathname === `/admin/${edition.slug}`);

  const integrityRoute = (path: string) =>
    path.startsWith("/televoting/admin/integrity") ||
    path.startsWith("/televoting/admin/intelligence") ||
    path.startsWith("/televoting/admin/audit-log") ||
    path.startsWith("/admin/hod-history") ||
    path.startsWith("/admin/sync-health");

  const mobileItems: MobileItem[] = [
    {
      label: "Operations",
      href: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) =>
        path.startsWith("/admin/operations") ||
        path.startsWith("/admin/control-room") ||
        path.startsWith("/admin/action-centre"),
    },
    {
      label: "Data",
      href: editionHref,
      icon: Trophy,
      active: (path) =>
        path === "/admin" ||
        path === "/admin/" ||
        editions.some((edition) => path === `/admin/${edition.slug}`) ||
        path.startsWith("/admin/hosts") ||
        path.startsWith("/admin/country-accounts") ||
        path.startsWith("/admin/predictions"),
    },
    {
      label: "Confirm",
      href: "/confirmations/admin",
      icon: ClipboardCheck,
      active: (path) => path.startsWith("/confirmations/admin"),
    },
    {
      label: "Voting",
      href: "/televoting/admin",
      icon: Vote,
      active: (path) => path.startsWith("/televoting/admin") && !integrityRoute(path),
    },
    {
      label: "Integrity",
      href: "/televoting/admin/integrity",
      icon: ShieldAlert,
      active: integrityRoute,
    },
  ];

  return (
    <div
      className={cn(
        "min-h-[calc(100vh-4rem)]",
        !isEditionWorkspace && "lg:grid lg:grid-cols-[248px_minmax(0,1fr)]",
      )}
    >
      {!isEditionWorkspace && (
        <aside className="admin-sidebar hidden border-r border-white/[0.07] lg:block">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto scroll-slim">
            <AdminNav />
          </div>
        </aside>
      )}

      <main
        className={cn(
          "admin-page min-w-0 p-3 pb-28 sm:p-5 lg:pb-8",
          isEditionWorkspace ? "lg:px-7 lg:py-6" : "lg:px-7 lg:py-6 xl:px-8",
        )}
      >
        {children}
      </main>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="admin-mobile-menu fixed bottom-[5.15rem] right-3 z-50 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-[#071023]/94 shadow-xl backdrop-blur-xl lg:hidden"
        aria-label="Open organizer navigation"
        aria-expanded={mobileOpen}
      >
        <Menu className="h-4.5 w-4.5" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/68 backdrop-blur-sm"
            aria-label="Close organizer navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="admin-drawer absolute inset-y-0 left-0 w-[min(90vw,350px)] overflow-y-auto border-r border-white/10 bg-[#071023]">
            <div className="sticky top-0 z-10 border-b border-white/10 bg-[#071023]/96 p-4 backdrop-blur-xl">
              <p className="font-display text-sm font-bold uppercase tracking-[-0.01em]">Solaris Operations</p>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Organizer workspace
              </p>
            </div>
            <div onClick={() => setMobileOpen(false)}>
              <AdminNav />
            </div>
          </aside>
        </div>
      )}

      <nav
        className="admin-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] px-2 pt-2 lg:hidden"
        style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
        aria-label="Organizer quick navigation"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = item.active(pathname);
            return (
              <Link
                key={item.label}
                to={item.href as any}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-13 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-semibold transition-colors",
                  active
                    ? "bg-sky-200/[0.09] text-sky-100"
                    : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
