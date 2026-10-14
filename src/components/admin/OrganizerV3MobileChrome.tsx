import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BellRing,
  LayoutDashboard,
  MoreHorizontal,
  RadioTower,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useEffect } from "react";

import {
  OrganizerV6TabBar,
  type OrganizerV6TabItem,
} from "@/components/admin/OrganizerV6TabBar";
import { useOrganizerTaskCountV5 } from "@/lib/admin-tasks-v5";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { useEditions } from "@/lib/data";
import { prefersReducedMotion } from "@/lib/interaction-physics";
import { useOrganisationBackendContract } from "@/lib/organisation-backend-contract";
import { resolveOrganizerV6Screen } from "@/lib/organizer-v6-screen-registry";
import {
  consumeV3OrganizerNavigationRestore,
  getV3OrganizerTabDestination,
  markV3OrganizerNavigationRestore,
  rememberV3OrganizerLocation,
  resetV3OrganizerTabToRoot,
  updateV3OrganizerScrollPosition,
  v3OrganizerEntryHref,
} from "@/lib/v3-organizer-navigation";
import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabForPath,
  v3OrganizerTabRoot,
  type V3OrganizerTabId,
} from "@/lib/v3-organizer";
import { useAdminContext } from "./AdminContext";

type TabDefinition = {
  id: V3OrganizerTabId;
  label: string;
  icon: LucideIcon;
};

const TAB_DEFINITIONS: Readonly<Record<V3OrganizerTabId, TabDefinition>> = {
  overview: { id: "overview", label: "Overview", icon: LayoutDashboard },
  tasks: { id: "tasks", label: "Tasks", icon: BellRing },
  control: { id: "control", label: "Control", icon: SlidersHorizontal },
  live: { id: "live", label: "Live", icon: RadioTower },
  more: { id: "more", label: "More", icon: MoreHorizontal },
};

/** Canonical V3 Organizer mobile navigation. Operational content remains owned by the existing safe admin routes. */
export function OrganizerV3MobileChrome() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();
  const screen = resolveOrganizerV6Screen(pathname);
  const activeTab = v3OrganizerTabForPath(pathname);
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const backend = useOrganisationBackendContract();
  const tasksSupported = backend.data?.capabilities.organizerTasks === true;
  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const taskCount = useOrganizerTaskCountV5(activeEdition?.id ?? null, tasksSupported);
  const unresolvedTaskCount =
    tasksSupported && !taskCount.isError && typeof taskCount.data === "number"
      ? taskCount.data
      : undefined;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 899px)").matches) {
      return;
    }

    const restoreY = consumeV3OrganizerNavigationRestore(pathname, searchStr);
    rememberV3OrganizerLocation(pathname, searchStr, restoreY ?? undefined);
    if (restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
      });
    }

    let frame: number | null = null;
    const persistScroll = () => {
      frame = null;
      updateV3OrganizerScrollPosition(pathname, searchStr, window.scrollY);
    };
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(persistScroll);
    };
    const onPageHide = () =>
      updateV3OrganizerScrollPosition(pathname, searchStr, window.scrollY);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (frame != null) window.cancelAnimationFrame(frame);
      updateV3OrganizerScrollPosition(pathname, searchStr, window.scrollY);
    };
  }, [pathname, searchStr]);

  const items = V3_ORGANIZER_TAB_ORDER.map((id): OrganizerV6TabItem => {
    const definition = TAB_DEFINITIONS[id];
    return {
      id,
      label: definition.label,
      href: v3OrganizerTabRoot(id),
      availability: "ready",
      icon: definition.icon,
      active: activeTab === id,
      badge: id === "tasks" ? unresolvedTaskCount : undefined,
    };
  });

  const openTab = (id: V3OrganizerTabId) => {
    if (typeof window === "undefined" || window.innerWidth >= 900) return;
    const alreadyActive = activeTab === id;
    const rootPath = v3OrganizerTabRoot(id);
    const normalizedPath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
    const normalizedRoot = rootPath.endsWith("/") && rootPath !== "/" ? rootPath.slice(0, -1) : rootPath;

    if (alreadyActive && normalizedPath === normalizedRoot) {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }

    const target = alreadyActive
      ? resetV3OrganizerTabToRoot(id)
      : getV3OrganizerTabDestination(id);
    markV3OrganizerNavigationRestore(target);
    void runAppViewTransition(alreadyActive ? "pop" : "tab", () =>
      navigate({ to: v3OrganizerEntryHref(target) as any }),
    );
  };

  return (
    <OrganizerV6TabBar
      pathname={pathname}
      mode={screen.tabbar}
      items={items}
      onSelect={(item) => openTab(item.id as V3OrganizerTabId)}
    />
  );
}
