import {
  resolveSolarisAppScreen,
  type SolarisAppScreen,
} from "@/lib/app-screen-registry";
import {
  evaluateV3Rollout,
  type V3RolloutContext,
  type V3RolloutDecision,
  type V3RolloutRule,
} from "./v3-rollout";

export type V3ShellMount = "legacy_shell" | "v3_shell";

export type V3ShellRouteBlockReason =
  | V3RolloutDecision["reason"]
  | "route_excluded"
  | "unknown_screen"
  | "authentication_required"
  | "critical_task"
  | "immersive_screen"
  | "unsupported_tabbar"
  | "missing_root_tab";

export type V3ShellRouteDecision = {
  mount: V3ShellMount;
  useV3Shell: boolean;
  pathname: string;
  screenId: string;
  rootTab: SolarisAppScreen["hierarchy"]["rootTab"];
  reason: V3ShellRouteBlockReason;
  rollout: V3RolloutDecision;
};

const EXCLUDED_ROUTE_PREFIXES = [
  "/v3-preview",
  "/auth",
  "/admin",
  "/organizer",
  "/maintenance",
] as const;

function routeMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizePathname(pathname: string) {
  const normalized = pathname.trim();
  if (!normalized.startsWith("/")) {
    throw new Error("V3 shell routing requires an absolute app pathname");
  }
  return normalized || "/";
}

function legacyDecision(input: {
  pathname: string;
  screen: SolarisAppScreen;
  reason: V3ShellRouteBlockReason;
  rollout: V3RolloutDecision;
}): V3ShellRouteDecision {
  return {
    mount: "legacy_shell",
    useV3Shell: false,
    pathname: input.pathname,
    screenId: input.screen.id,
    rootTab: input.screen.hierarchy.rootTab,
    reason: input.reason,
    rollout: input.rollout,
  };
}

/**
 * Chooses shell chrome only. It never redirects or changes route ownership.
 *
 * V3 shell rollout is deliberately narrower than V3 feature rollout: until the
 * new shell has dedicated focused/minimal/immersive variants, only known
 * full-tab Solaris app screens may use it. Critical workflows therefore keep
 * their existing focused chrome even when the user's V3 rollout cohort is on.
 */
export function decideV3ShellForRoute(input: {
  pathname: string;
  search?: string;
  rolloutRule: V3RolloutRule | null | undefined;
  rolloutContext: V3RolloutContext;
  isAuthenticated: boolean;
}): V3ShellRouteDecision {
  const pathname = normalizePathname(input.pathname);
  const screen = resolveSolarisAppScreen(pathname, input.search ?? "");
  const rollout = evaluateV3Rollout(input.rolloutRule, input.rolloutContext);

  if (!rollout.enabled) {
    return legacyDecision({
      pathname,
      screen,
      reason: rollout.reason,
      rollout,
    });
  }

  if (EXCLUDED_ROUTE_PREFIXES.some((prefix) => routeMatchesPrefix(pathname, prefix))) {
    return legacyDecision({
      pathname,
      screen,
      reason: "route_excluded",
      rollout,
    });
  }

  if (screen.id === "fallback") {
    return legacyDecision({
      pathname,
      screen,
      reason: "unknown_screen",
      rollout,
    });
  }

  if (screen.access.auth === "authenticated" && !input.isAuthenticated) {
    return legacyDecision({
      pathname,
      screen,
      reason: "authentication_required",
      rollout,
    });
  }

  if (screen.behavior.criticalTask) {
    return legacyDecision({
      pathname,
      screen,
      reason: "critical_task",
      rollout,
    });
  }

  if (screen.behavior.immersive) {
    return legacyDecision({
      pathname,
      screen,
      reason: "immersive_screen",
      rollout,
    });
  }

  if (screen.chrome.tabbar !== "full") {
    return legacyDecision({
      pathname,
      screen,
      reason: "unsupported_tabbar",
      rollout,
    });
  }

  if (screen.hierarchy.rootTab === null) {
    return legacyDecision({
      pathname,
      screen,
      reason: "missing_root_tab",
      rollout,
    });
  }

  return {
    mount: "v3_shell",
    useV3Shell: true,
    pathname,
    screenId: screen.id,
    rootTab: screen.hierarchy.rootTab,
    reason: "enabled",
    rollout,
  };
}

export { EXCLUDED_ROUTE_PREFIXES };
