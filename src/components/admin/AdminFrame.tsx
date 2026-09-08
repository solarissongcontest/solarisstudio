import { Link, useRouterState } from "@tanstack/react-router";
import {
  Eye,
  LayoutDashboard,
  Layers3,
  Menu,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { DelegationColourOverview } from "@/components/confirmations/DelegationColourOverview";
import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";
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
  const publishHref = slug ? `/admin/publication/${slug}` : "/admin";

  const mobileItems: MobileItem[] = [
    {
      label: "Home",
      href: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) => path.startsWith("/admin/operations"),
    },
    {
      label: "Contest",
      href: editionHref,
      icon: Layers3,
      active: (path) =>
        (slug ? path === `/admin/${slug}` : false) ||
        path.startsWith("/admin/shows/") ||
        path.startsWith("/admin/entries/") ||
        path.startsWith("/admin/lineup-sync/") ||
        path.startsWith("/admin/participant-status/"),
    },
    {
      label: "Voting",
      href: "/televoting/admin",
      icon: Vote,
      active: (path) =>
        path.startsWith("/televoting/admin") ||
        path.startsWith("/admin/jury/") ||
        path.startsWith("/admin/voting-system/") ||
        path.startsWith("/admin/televote/") ||
        path.startsWith("/admin/friend-voting") ||
        path.startsWith("/admin/jury-integrity"),
    },
    {
      label: "Publish",
      href: publishHref,
      icon: Eye,
      active: (path) => path.startsWith("/admin/publication/"),
    },
    {
      label: "Menu",
      href: "/admin/menu",
      icon: Menu,
      active: (path) =>
        path.startsWith("/admin/menu") ||
        path.startsWith("/confirmations/admin") ||
        path.startsWith("/admin/design/") ||
        path.startsWith("/admin/edition-theme/") ||
        path.startsWith("/admin/more") ||
        path.startsWith("/admin/country-accounts") ||
        path.startsWith("/admin/hod-history") ||
        path.startsWith("/admin/hosts") ||
        path.startsWith("/admin/predictions") ||
        path.startsWith("/admin/beta") ||
        path.startsWith("/admin/admin-beta") ||
        path.startsWith("/admin/anniversary") ||
        path.startsWith("/admin/guide") ||
        path.startsWith("/admin/system") ||
        path.startsWith("/admin/sync-health"),
    },
  ];

  return (
    <div className="admin-frame min-h-[calc(100vh-4rem)]">
      <aside className="admin-sidebar border-r border-white/[0.07]">
        <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto scroll-slim">
          <AdminNav />
        </div>
      </aside>

      <main className="admin-page admin-main min-w-0">
        <AdminSectionNav />
        {children}
        {pathname === "/confirmations/admin/countries" ? <DelegationColourOverview /> : null}
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
                  "flex min-h-[3.45rem] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors",
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
