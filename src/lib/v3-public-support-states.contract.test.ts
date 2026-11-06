import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Public launch, loading and recovery support states", () => {
  it("keeps the installed-app launch identity Solaris-owned", () => {
    const manifest = read("public/site.webmanifest");
    const source = read("src/components/app/AppLaunchRestoreCoordinator.tsx");

    expect(manifest).toContain('"name": "Solaris Studio"');
    expect(manifest).toContain('"short_name": "Solaris Studio"');
    expect(manifest).toContain('"start_url": "/app-launch"');
    expect(source).toContain("app_cold_launch_restored");
    expect(source).not.toContain("TSBC");
  });

  it("keeps cold-launch restore transaction-scoped instead of forcing a splash for every route", () => {
    const source = read("src/components/app/AppLaunchRestoreCoordinator.tsx");

    expect(source).toContain("readAppLaunchTransaction()");
    expect(source).toContain("if (!transaction) return;");
    expect(source).toContain('if (pathname === "/app-launch") return;');
    expect(source).toContain('if (pathname !== "/" && pathname !== safeRoot.pathname)');
    expect(source).toContain("getAppLaunchDestinationFromSnapshot");
    expect(source).toContain("window.location.replace(targetHref)");
    expect(source).toContain("return null;");
  });

  it("provides route-shaped skeleton variants while retaining a generic router fallback", () => {
    const source = read("src/components/app/AppRouteStateFrame.tsx");
    const notifications = read("src/routes/_authenticated/notifications.tsx");

    expect(source).toContain('| "generic"');
    expect(source).toContain('| "reference"');
    expect(source).toContain('| "notifications"');
    expect(source).toContain('| "article"');
    expect(source).toContain('data-v3-route-skeleton={variant}');
    expect(source).toContain('role="status"');
    expect(notifications).toContain('variant="notifications"');
    expect(notifications).toContain('label="Loading your notifications…"');
  });

  it("keeps recovery copy in user language rather than exposing architecture vocabulary", () => {
    const source = read("src/lib/app-error-state.ts");

    expect(source).toContain("This changed before your action finished");
    expect(source).toContain("Reload the latest version, review what changed, then try again");
    expect(source).toContain("This link may have moved, expired, become private");
    expect(source).not.toContain("canonical server state");
    expect(source).not.toContain("database-backed reads");
  });

  it("has explicit offline presence and safe installed-app reconnect feedback", () => {
    const offline = read("src/components/app/AppOfflineBanner.tsx");
    const reconnect = read("src/components/app/AppReconnectReconciler.tsx");

    expect(offline).toContain("You’re offline");
    expect(reconnect).toContain("APP_CONNECTIVITY_RECOVERED_EVENT");
    expect(reconnect).toContain("invalidateQueries");
    expect(reconnect).toContain("router.invalidate");
    expect(reconnect).toContain('chrome.archetype === "task" || chrome.archetype === "immersive"');
    expect(reconnect).toContain("if (!isAppMode || !showRecovered) return null");
    expect(reconnect).toContain('data-solaris-app-reconnected=""');
    expect(reconnect).toContain("Back online · refreshing Solaris");
  });
});
