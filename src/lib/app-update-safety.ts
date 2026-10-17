import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

export type AppUpdateBlocker = {
  id: string;
  reason: string;
};

const blockers = new Map<string, string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setAppUpdateBlocker(
  id: string,
  blocked: boolean,
  reason = "Critical app work is in progress.",
) {
  const previous = blockers.get(id);
  if (blocked) {
    if (previous === reason) return;
    blockers.set(id, reason);
    emit();
    return;
  }
  if (blockers.delete(id)) emit();
}

export function clearAppUpdateBlocker(id: string) {
  setAppUpdateBlocker(id, false);
}

export function subscribeAppUpdateSafety(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAppUpdateBlockers(): AppUpdateBlocker[] {
  return [...blockers.entries()].map(([id, reason]) => ({ id, reason }));
}

function organizerRouteUpdateBlocker(pathname: string): AppUpdateBlocker | null {
  if (
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/televoting/admin")
  ) {
    return {
      id: "organizer-workspace",
      reason: "Leave the active Organizer workspace before updating.",
    };
  }
  return null;
}

export function routeUpdateBlocker(pathname: string): AppUpdateBlocker | null {
  const organizerBlocker = organizerRouteUpdateBlocker(pathname);
  if (organizerBlocker) return organizerBlocker;

  // Critical participant work is classified once by the canonical screen
  // registry. Update safety must follow that contract instead of maintaining a
  // second route allowlist that can silently miss a newly added critical task.
  const screen = resolveSolarisAppScreen(pathname);
  if (screen.behavior.criticalTask) {
    return {
      id: "focused-participation-task",
      reason: `Finish or leave ${screen.title} before updating Solaris Studio.`,
    };
  }

  return null;
}

export function appUpdateSafety(pathname: string) {
  const routeBlocker = routeUpdateBlocker(pathname);
  const dynamic = readAppUpdateBlockers();
  const all = routeBlocker ? [routeBlocker, ...dynamic] : dynamic;
  return {
    safe: all.length === 0,
    blockers: all,
    reason: all[0]?.reason ?? null,
  };
}
