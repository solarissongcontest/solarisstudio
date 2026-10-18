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
import { resolveV3OrganizerTabbarMode } from "@/lib/v3-organizer-navigation-policy";
import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabForPath,
  v3OrganizerTabRoot,
  type V3OrganizerTabId,
} from "@/lib/v3-organizer";
import { useAdminContext } from "./AdminContext";
import { resolveAdminEditionContext } from "./admin-edition-context";

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
  const legacyScreen = resolveOrganizerV6Screen(pathname);
  const tabbarMode = resolveV3OrganizerTabbarMode(pathname, legacyScreen.tabbar);
  const activeTab = v3OrganizerTabForPath(pathname);
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const backend = useOrganisationBackendContract();
  const tasksSupported = backend.data?.capabilities.organizerTasks === true;
  const activeEdition = resolveAdminEditionContext(editions, editionId);
  const navigationScope = activeEdition?.id ?? null;
  const navigationMemoryReady = navigationScope != null;
  const taskCount = useOrganizerTaskCountV5(activeEdition?.id ?? null, tasksSupported);
  const unresolvedTaskCount =
    tasksSupported && !taskCount.isError && typeof taskCount.data === "number"
      ? taskCount.data
      : undefined;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.matchMedia("(max-width: 899px)").matches ||
      !navigationMemoryReady
    ) {
      return;
    }

    const restoreY = consumeV3OrganizerNavigationRestore(
      pathname,
      searchStr,
      undefined,
      navigationScope,
    );
    rememberV3OrganizerLocation(
      pathname,
      searchStr,
      restoreY ?? undefined,
      undefined,
      navigationScope,
    );
    if (restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
      });
    }

    let frame: number | null = null;
    const persistScroll = () => {
      frame = null;
      updateV3OrganizerScrollPosition(
        pathname,
        searchStr,
        window.scrollY,
        undefined,
        navigationScope,
      );
    };
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(persistScroll);
    };
    const onPageHide = () =>
      updateV3OrganizerScrollPosition(
        pathname,
        searchStr,
        window.scrollY,
        undefined,
        navigationScope,
      );

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (frame != null) window.cancelAnimationFrame(frame);
      updateV3OrganizerScrollPosition(
        pathname,
        searchStr,
        window.scrollY,
        undefined,
        navigationScope,
      );
    };
  }, [navigationMemoryReady, navigationScope, pathname, searchStr]);

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
    const normalizedRoot = rootPath.endsWith("/") ? rootPath.slice(0, -1) : rootPath;

    if (alreadyActive && normalizedPath === normalizedRoot) {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }

    // Exact-edition memory never degrades into a shared unscoped bucket. The
    // canonical roots remain usable while edition authority is unresolved.
    const navigationStorage = navigationMemoryReady ? undefined : null;
    const target = alreadyActive
      ? resetV3OrganizerTabToRoot(id, navigationStorage, navigationScope)
      : getV3OrganizerTabDestination(id, navigationStorage, navigationScope);
    if (navigationMemoryReady) {
      markV3OrganizerNavigationRestore(target, undefined, navigationScope);
    }
    void runAppViewTransition(alreadyActive ? "pop" : "tab", () =>
      navigate({ to: v3OrganizerEntryHref(target) as any }),
    );
  };

  return (
    <OrganizerV6TabBar
      pathname={pathname}
      mode={tabbarMode}
      items={items}
      onSelect={(item) => openTab(item.id as V3OrganizerTabId)}
    />
  );
}
