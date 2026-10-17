import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BellRing,
  Flag,
  LayoutDashboard,
  Layers3,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";

import { OrganizerV6TabBar, type OrganizerV6TabItem } from "@/components/admin/OrganizerV6TabBar";
import {
  adminAppTabRoot,
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
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { useEditions } from "@/lib/data";
import { prefersReducedMotion } from "@/lib/interaction-physics";
import { useOrganisationBackendContract } from "@/lib/organisation-backend-contract";
import { resolveOrganizerV6Screen } from "@/lib/organizer-v6-screen-registry";
import { v3OrganizerTabForPath } from "@/lib/v3-organizer";
import { useAdminContext } from "./AdminContext";
import { resolveAdminEditionContext } from "./admin-edition-context";

type MobileItem = {
  id: AdminAppTabId;
  label: string;
  href: string;
  availability: "ready";
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

/**
 * Canonical Organizer V3 mobile chrome owner.
 *
 * Domain content remains Organizer-owned; this component only maps the five
 * canonical operational roots onto shared mobile navigation mechanics and
 * per-root route/scroll memory.
 */
export function OrganizerV6MobileChrome() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();
  const screen = resolveOrganizerV6Screen(pathname);
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const backend = useOrganisationBackendContract();
  const tasksSupported = backend.data?.capabilities.organizerTasks === true;
  const activeEdition = resolveAdminEditionContext(editions, editionId);
  const slug = activeEdition?.slug;
  const taskCount = useOrganizerTaskCountV5(
    activeEdition?.id ?? null,
    tasksSupported,
  );
  const unresolvedTaskCount =
    tasksSupported && !taskCount.isError && typeof taskCount.data === "number"
      ? taskCount.data
      : undefined;

  const mobileItems: MobileItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: "/admin/operations",
      availability: "ready",
      icon: LayoutDashboard,
      active: (path) => v3OrganizerTabForPath(path) === "overview",
    },
    {
      id: "tasks",
      label: "Tasks",
      href: "/admin/tasks",
      availability: "ready",
      icon: BellRing,
      active: (path) => v3OrganizerTabForPath(path) === "tasks",
    },
    {
      id: "control",
      label: "Control",
      href: "/admin/control",
      availability: "ready",
      icon: Layers3,
      active: (path) => v3OrganizerTabForPath(path) === "control",
    },
    {
      id: "live",
      label: "Live",
      href: "/admin/control-room",
      availability: "ready",
      icon: Flag,
      active: (path) => v3OrganizerTabForPath(path) === "live",
    },
    {
      id: "more",
      label: "More",
      href: "/admin/more",
      availability: "ready",
      icon: MoreHorizontal,
      active: (path) => v3OrganizerTabForPath(path) === "more",
    },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 899px)").matches) return;

    const restoreY = consumeAdminNavigationRestore(pathname, searchStr);
    rememberAdminLocation(pathname, searchStr, restoreY ?? undefined, slug);
    if (restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
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
    const onPageHide = () => updateAdminScrollPosition(pathname, searchStr, window.scrollY, slug);

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
    const normalizedPath =
      pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
    const normalizedRoot = root.endsWith("/") && root !== "/" ? root.slice(0, -1) : root;

    if (active && normalizedPath === normalizedRoot) {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }

    const target = active
      ? resetAdminAppTabToRoot(item.id, slug)
      : getAdminAppTabDestination(item.id, slug);
    markAdminNavigationRestore(target);
    void runAppViewTransition(active ? "pop" : "tab", () =>
      navigate({ to: adminEntryHref(target) as any }),
    );
  };

  return (
    <OrganizerV6TabBar
      pathname={pathname}
      mode={screen.tabbar}
      items={mobileItems.map((item): OrganizerV6TabItem => ({
        id: item.id,
        label: item.label,
        href: item.href,
        availability: item.availability,
        icon: item.icon,
        active: item.active(pathname),
        badge: item.id === "tasks" ? unresolvedTaskCount : undefined,
      }))}
      onSelect={(item) => {
        const source = mobileItems.find((candidate) => candidate.id === item.id);
        if (source) openMobileItem(source);
      }}
    />
  );
}
