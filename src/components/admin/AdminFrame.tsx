import { Link, useRouterState } from "@tanstack/react-router";
import {
  Inbox,
  LayoutDashboard,
  Layers3,
  MoreHorizontal,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { DelegationColourOverview } from "@/components/confirmations/DelegationColourOverview";
import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";
import { AdminFeatureBoundary } from "./AdminFeatureBoundary";
import { AdminNav } from "./AdminNav";
import { AdminSectionNav } from "./AdminSectionNav";

type MobileItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const slug = activeEdition?.slug;
  const editionHref = slug ? `/admin/${slug}` : "/admin";

  const editionRoute = (path: string) =>
    (slug ? path === `/admin/${slug}` : false) ||
    path.startsWith("/admin/countries") ||
    path.startsWith("/confirmations/admin") ||
    path.startsWith("/admin/shows/") ||
    path.startsWith("/admin/entries/") ||
    path.startsWith("/admin/lineup-sync/") ||
    path.startsWith("/admin/participant-status/") ||
    path.startsWith("/admin/hosts") ||
    path.startsWith("/admin/eligibility") ||
    path.startsWith("/admin/submission-versions") ||
    path.startsWith("/televoting/admin") ||
    path.startsWith("/admin/jury/") ||
    path.startsWith("/admin/voting-system/") ||
    path.startsWith("/admin/televote/") ||
    path.startsWith("/admin/friend-voting") ||
    path.startsWith("/admin/jury-integrity") ||
    path.startsWith("/admin/results") ||
    path.startsWith("/admin/voting-lab") ||
    path.startsWith("/admin/control-room") ||
    path.startsWith("/admin/broadcast-rundown") ||
    path.startsWith("/admin/workflows") ||
    path.startsWith("/admin/incidents") ||
    path.startsWith("/admin/edition-simulator") ||
    path.startsWith("/admin/storytelling") ||
    path.startsWith("/admin/media-assets") ||
    path.startsWith("/admin/communications") ||
    path.startsWith("/admin/publication/") ||
    path.startsWith("/admin/design/") ||
    path.startsWith("/admin/edition-theme/");

  const casesRoute = (path: string) =>
    path === "/admin/integrity" ||
    path.startsWith("/admin/integrity-") ||
    path.startsWith("/admin/integrity-case/") ||
    path.startsWith("/admin/integrity-resolution/") ||
    path.startsWith("/admin/rules-manager") ||
    path.startsWith("/admin/rule-interpretations");

  const mobileItems: MobileItem[] = [
    {
      label: "Home",
      href: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) => path.startsWith("/admin/operations"),
    },
    {
      label: "Inbox",
      href: "/admin/inbox",
      icon: Inbox,
      active: (path) => path.startsWith("/admin/inbox"),
    },
    {
      label: activeEdition?.edition_number ? `SSC${activeEdition.edition_number}` : "Edition",
      href: editionHref,
      icon: Layers3,
      active: editionRoute,
    },
    {
      label: "Cases",
      href: "/admin/integrity-investigations",
      icon: ShieldCheck,
      active: casesRoute,
    },
    {
      label: "More",
      href: "/admin/more",
      icon: MoreHorizontal,
      active: (path) =>
        !path.startsWith("/admin/operations") &&
        !path.startsWith("/admin/inbox") &&
        !editionRoute(path) &&
        !casesRoute(path),
    },
  ];

  return (
    <div className="admin-frame min-h-[calc(100vh-4rem)]">
      <aside className="admin-sidebar border-r border-white/[0.07]">
        <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto scroll-slim">
          <AdminFeatureBoundary
            name="desktop-navigation"
            fallback={
              <div className="p-3">
                <Link to="/admin/operations" className="admin-action-secondary w-full justify-start">Home</Link>
                <Link to="/admin/menu" className="admin-action-secondary mt-2 w-full justify-start">All Organizer tools</Link>
              </div>
            }
          >
            <AdminNav />
          </AdminFeatureBoundary>
        </div>
      </aside>

      <main className="admin-page admin-main min-w-0">
        <AdminFeatureBoundary
          name="section-navigation"
          fallback={
            <div className="mb-4 rounded-xl border border-amber-200/12 bg-amber-200/[0.04] p-3 text-xs">
              Section navigation could not load. <Link to="/admin/menu" className="font-semibold text-sky-100 underline">Open all Organizer tools</Link>.
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
      </main>

      <nav
        className="admin-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.08] px-2 pt-2"
        style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
        aria-label="Organizer navigation"
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
                  "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-sky-200/[0.09] text-sky-50"
                    : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                )}
              >
                <Icon className="size-[1.08rem]" />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
