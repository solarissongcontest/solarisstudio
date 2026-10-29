import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Public launch, loading and recovery support states", () => {
  it("keeps the installed-app launch identity Solaris-owned", () => {
    const source = read("src/components/app/AppLaunchRestoreCoordinator.tsx");

    expect(source).toContain('/solaris-app-mark.svg');
    expect(source).toContain('alt="Solaris Studio"');
    expect(source).toContain("Solaris Studio");
    expect(source).toContain("Opening your saved view");
    expect(source).not.toContain("TSBC");
  });

  it("keeps warm launch restore scoped instead of forcing a splash for every route", () => {
    const source = read("src/components/app/AppLaunchRestoreCoordinator.tsx");

    expect(source).toContain("launchRestoreNeeded");
    expect(source).toContain("restoreIntent");
    expect(source).toContain("data-solaris-app-boot");
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

  it("has explicit offline presence and reconnect reconciliation", () => {
    const offline = read("src/components/app/AppOfflineBanner.tsx");
    const reconnect = read("src/components/app/AppReconnectReconciler.tsx");

    expect(offline).toContain("You’re offline");
    expect(reconnect).toContain("cancelQueries");
    expect(reconnect).toContain("invalidateQueries");
    expect(reconnect).toContain("refetchQueries");
  });
});
