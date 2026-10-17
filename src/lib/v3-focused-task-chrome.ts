import {
  resolveSolarisAppScreen,
  type SolarisAppScreen,
} from "@/lib/app-screen-registry";

export type V3CriticalTaskToolbarMode = "focused" | "hidden";

export type V3FocusedTaskChrome = {
  pathname: string;
  screenId: string;
  title: string;
  rootTab: NonNullable<SolarisAppScreen["hierarchy"]["rootTab"]>;
  toolbarMode: V3CriticalTaskToolbarMode;
  backLabel: string;
  backTo: string;
  helpTo: string | null;
};

function absoluteAppPath(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error(`${label} must be an internal absolute Solaris route`);
  }
  return normalized;
}

/**
 * Resolves chrome for routes already classified by the canonical app-screen
 * registry as critical participant tasks. It intentionally does not create a
 * second workflow-route map.
 *
 * Most critical tasks use the shared focused Back/Help toolbar. A task may
 * instead own its in-content exit/help controls and request `toolbar: hidden`;
 * the shell still supplies the critical-work boundary, update blocking and
 * global-tab suppression without inventing duplicate controls.
 */
export function resolveV3FocusedTaskChrome(
  pathname: string,
  search = "",
): V3FocusedTaskChrome {
  const normalizedPath = absoluteAppPath(pathname, "pathname");
  const screen = resolveSolarisAppScreen(normalizedPath, search);

  if (screen.id === "fallback") {
    throw new Error("unknown route cannot enter the V3 focused task shell");
  }
  if (!screen.behavior.criticalTask) {
    throw new Error("route is not classified as a critical participant task");
  }
  if (screen.behavior.immersive) {
    throw new Error("immersive routes require dedicated immersive V3 chrome");
  }
  if (screen.chrome.toolbar !== "focused" && screen.chrome.toolbar !== "hidden") {
    throw new Error("critical task must use focused or hidden toolbar chrome");
  }
  if (screen.chrome.tabbar !== "hidden") {
    throw new Error("critical task must hide the global tab bar");
  }
  if (!screen.hierarchy.rootTab) {
    throw new Error("critical task is missing canonical root-tab context");
  }
  if (!screen.hierarchy.parent) {
    throw new Error("critical task is missing a canonical exit destination");
  }

  const title = screen.title.trim();
  if (!title) throw new Error("critical task is missing a screen title");

  return {
    pathname: normalizedPath,
    screenId: screen.id,
    title,
    rootTab: screen.hierarchy.rootTab,
    toolbarMode: screen.chrome.toolbar,
    backLabel: screen.hierarchy.parent.label.trim() || "Back",
    backTo: absoluteAppPath(screen.hierarchy.parent.href, "backTo"),
    helpTo: screen.helpTo ? absoluteAppPath(screen.helpTo, "helpTo") : null,
  };
}
