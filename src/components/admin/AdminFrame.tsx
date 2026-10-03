import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BellRing,
  Flag,
  LayoutDashboard,
  Layers3,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { DelegationColourOverview } from "@/components/confirmations/DelegationColourOverview";
import {
  OrganizerV6TabBar,
  type OrganizerV6TabItem,
} from "@/components/admin/OrganizerV6TabBar";
import {
  adminAppTabRoot,
  adminDelegationRoute,
  adminEditionRoute,
  adminEntryHref,
  consumeAdminNavigationRestore,
  getAdminAppTabDestination,
  markAdminNavigationRestore,
  rememberAdminLocation,
  resetAdminAppTabToRoot,
  updateAdminScrollPosition,
  type AdminAppTabId,
} from "@/lib/admin-app-navigation";
import { useOrganizerTaskCountV5 } from "@/lib/admin-tasks-v5";
import { useEditions } from "@/lib/data";
import { useAdminContext } from "./AdminContext";
import { AdminFeatureBoundary } from "./AdminFeatureBoundary";
import { AdminNav } from "./AdminNav";
import { AdminSectionNav } from "./AdminSectionNav";

type MobileItem = {
  id: AdminAppTabId;
  label: string;
  href: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const slug = activeEdition?.slug;
  const editionHref = slug ? `/admin/${slug}` : "/admin";
  const { data: unresolvedTaskCount = 0 } = useOrganizerTaskCountV5(activeEdition?.id ?? null);

  const mobileItems: MobileItem[] = [
    {
      id: "home",
      label: "Home",
      href: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) => path.startsWith("/admin/operations"),
    },
    {
      id: "edition",
      label: "Edition",
      href: editionHref,
      icon: Layers3,
      active: (path) => adminEditionRoute(path, slug),
    },
    {
      id: "tasks",
      label: "Tasks",
      href: "/admin/tasks",
      icon: BellRing,
      active: (path) =>
        path.startsWith("/admin/tasks") ||
        path.startsWith("/admin/action-center") ||
        path.startsWith("/admin/action-centre") ||
        path.startsWith("/admin/inbox"),
    },
    {
      id: "delegations",
      label: "Delegations",
      href: "/admin/countries",
      icon: Flag,
      active: adminDelegationRoute,
    },
    {
      id: "more",
      label: "More",
      href: "/admin/more",
      icon: MoreHorizontal,
      active: (path) =>
        !path.startsWith("/admin/operations") &&
        !path.startsWith("/admin/tasks") &&
        !(
          path.startsWith("/admin/action-center") ||
          path.startsWith("/admin/action-centre") ||
          path.startsWith("/admin/inbox")
        ) &&
        !adminDelegationRoute(path) &&
        !adminEditionRoute(path, slug),
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobile = window.matchMedia("(max-width: 899px)");
    if (!mobile.matches) return;

    const restoreY = consumeAdminNavigationRestore(pathname, searchStr);
    rememberAdminLocation(pathname, searchStr, restoreY ?? undefined, slug);

    if (restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() =>
          window.scrollTo({ top: restoreY, behavior: "auto" }),
        );
      });
    }

    let frame: number | null = null;
    const persistScroll = () => {
      frame = null;
      updateAdminScrollPosition(pathname, searchStr, window.scrollY, slug);
    };
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(persistScroll);
    };
    const onPageHide = () =>
      updateAdminScrollPosition(pathname, searchStr, window.scrollY, slug);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (frame != null) window.cancelAnimationFrame(frame);
      updateAdminScrollPosition(pathname, searchStr, window.scrollY, slug);
    };
  }, [pathname, searchStr, slug]);

  const openMobileItem = (item: MobileItem) => {
    if (typeof window === "undefined" || window.innerWidth >= 900) return;

    const active = item.active(pathname);
    const root = adminAppTabRoot(item.id, slug);
    const normalizedPath = pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;
    const normalizedRoot = root.endsWith("/") && root !== "/"
      ? root.slice(0, -1)
      : root;

    if (active && normalizedPath === normalizedRoot) {
      const reducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
      return;
    }

    const target = active
      ? resetAdminAppTabToRoot(item.id, slug)
      : getAdminAppTabDestination(item.id, slug);
    markAdminNavigationRestore(target);
    void navigate({ to: adminEntryHref(target) as any });
  };

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

      <OrganizerV6TabBar
        pathname={pathname}
        items={mobileItems.map(
          (item): OrganizerV6TabItem => ({
            id: item.id,
            label: item.label,
            href: item.href,
            icon: item.icon,
            active: item.active(pathname),
            badge: item.id === "tasks" ? unresolvedTaskCount : 0,
          }),
        )}
        onSelect={(item) => {
          const source = mobileItems.find((candidate) => candidate.id === item.id);
          if (source) openMobileItem(source);
        }}
      />
    </div>
  );
}
