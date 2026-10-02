import type { AppTabId } from "@/lib/app-navigation";
import {
  resolveSolarisAppScreen,
  type SolarisAppPresentation,
  type SolarisAppSearchMode,
} from "@/lib/app-screen-registry";

export type AppScreenArchetype =
  | "root"
  | "directory"
  | "entity"
  | "workspace"
  | "data"
  | "reading"
  | "task"
  | "live"
  | "immersive"
  | "settings"
  | "core";

export type AppTabBarMode = "visible" | "hidden" | "minimal";

export type AppRouteChrome = {
  title: string;
  tab: AppTabId | null;
  archetype: AppScreenArchetype;
  root: boolean;
  tabBar: AppTabBarMode;
  search: SolarisAppSearchMode;
  backFallback?: {
    label: string;
    to: string;
  };
  helpTo?: string;
};

function legacyArchetype(presentation: SolarisAppPresentation): AppScreenArchetype {
  if (presentation === "article") return "reading";
  if (presentation === "workspace") return "workspace";
  return presentation;
}

/**
 * Compatibility adapter for existing app chrome consumers.
 *
 * The canonical decision now lives in app-screen-registry.ts. Toolbar, tabbar,
 * back-navigation and route QA all derive from the same screen contract instead
 * of independently interpreting the pathname.
 */
export function resolveAppRouteChrome(pathname: string, searchStr = ""): AppRouteChrome {
  const screen = resolveSolarisAppScreen(pathname, searchStr);

  return {
    title: screen.title,
    tab: screen.hierarchy.rootTab,
    archetype: legacyArchetype(screen.presentation),
    root: screen.presentation === "root",
    tabBar:
      screen.chrome.tabbar === "full"
        ? "visible"
        : screen.chrome.tabbar,
    search: screen.chrome.search,
    backFallback: screen.hierarchy.parent
      ? {
          label: screen.hierarchy.parent.label,
          to: screen.hierarchy.parent.href,
        }
      : undefined,
    helpTo: screen.helpTo,
  };
}
