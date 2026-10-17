import {
  resolveSolarisAppScreen,
  type SolarisAppScreen,
} from "@/lib/app-screen-registry";

export type V3FocusedTaskChrome = {
  pathname: string;
  screenId: string;
  title: string;
  rootTab: NonNullable<SolarisAppScreen["hierarchy"]["rootTab"]>;
  backLabel: string;
  backTo: string;
  helpTo: string | null;
};

export type V3FocusedParticipationRollout = {
  enabled?: boolean;
  confirmationEnabled?: boolean;
  juryEnabled?: boolean;
} | null | undefined;

function absoluteAppPath(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error(`${label} must be an internal absolute Solaris route`);
  }
  return normalized;
}

/**
 * One fail-closed rollout decision for the shared participation task shell and
 * the compatibility AppToolbar that must disappear when that shell owns chrome.
 * Keeping both consumers on this helper prevents duplicate or missing Back/Help
 * regions if feature-specific rollout rules evolve.
 */
export function v3FocusedParticipationRouteEnabled(
  pathname: string,
  rollout: V3FocusedParticipationRollout,
) {
  const normalizedPath = absoluteAppPath(pathname, "pathname");
  const screen = resolveSolarisAppScreen(normalizedPath);
  if (
    screen.id !== "participation.task" ||
    !screen.behavior.criticalTask ||
    screen.chrome.toolbar !== "focused" ||
    rollout?.enabled !== true
  ) {
    return false;
  }

  if (normalizedPath.startsWith("/confirmations")) {
    return rollout.confirmationEnabled === true;
  }
  if (normalizedPath.startsWith("/jury-voting")) {
    return rollout.juryEnabled === true;
  }
  return (
    normalizedPath.startsWith("/televoting") ||
    normalizedPath.startsWith("/next-in-line")
  );
}

/**
 * Resolves chrome for routes already classified by the canonical app-screen
 * registry as critical participant tasks. It intentionally does not create a
 * second workflow-route map.
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
  if (screen.chrome.toolbar !== "focused") {
    throw new Error("critical task must use focused toolbar chrome");
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
    backLabel: screen.hierarchy.parent.label.trim() || "Back",
    backTo: absoluteAppPath(screen.hierarchy.parent.href, "backTo"),
    helpTo: screen.helpTo ? absoluteAppPath(screen.helpTo, "helpTo") : null,
  };
}
