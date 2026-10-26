import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("PR 450 browser blocker regressions", () => {
  it("cancels queued liquid-glass work before it can update React after teardown", () => {
    const kube = source("src/components/app/KubeLiquidGlassBackdrop.tsx");

    expect(kube).toContain("let disposed = false;");
    expect(kube.match(/if \(disposed\) return;/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(kube).toMatch(
      /return \(\) => \{\s*disposed = true;\s*cancelAnimationFrame\(frame\);\s*observer\.disconnect\(\);/,
    );
  });

  it("keeps Organizer filter controls explicitly named", () => {
    const countries = source("src/routes/_authenticated/admin/countries.tsx");
    const selectors = source("src/components/admin/AdminSelectors.tsx");
    const countryPicker = source("src/components/CountryPicker.tsx");

    // The V3 Delegations search now covers country, HOD, artist and song, so the
    // accessible name follows the broader operational object instead of the old
    // country-only wording. The regression guard still requires an explicit
    // screen-reader label rather than relying on placeholder text.
    expect(countries).toContain('<span className="sr-only">Search delegations</span>');
    expect(countries).toContain('aria-label="Filter countries by readiness"');
    expect(selectors).toContain('aria-label="Search editions"');
    expect(countryPicker).toContain('aria-label="Search country"');
  });

  it("authorizes Organizer routes in the canonical mounted fail-closed gate", () => {
    const authenticated = source("src/routes/_authenticated/route.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");

    expect(authenticated).toContain("function AuthenticatedIdentityGate");
    expect(authenticated).toContain("data.user.id !== sessionUserId");
    expect(authenticated).toContain("<AuthenticatedUserProvider user={authenticatedUser}>");
    expect(authenticated).not.toContain("hasSolarisOrganizerAccess");
    expect(authenticated).not.toContain("beforeLoad:");

    expect(adminRoute).toContain("function OrganizerAccessGate");
    expect(adminRoute).toContain("hasSolarisOrganizerAccess(user.id)");
    expect(adminRoute).not.toContain('.from("user_roles")');
    expect(adminRoute).toContain('to: "/my-solaris"');
    expect(adminRoute).toContain('notice: "organizer-access-required"');
    expect(adminRoute).toContain("replace: true");
    expect(adminRoute).toContain("<OrganizerAccessGate user={user}>");
    expect(adminRoute).not.toContain("supabase.auth.getUser");
    expect(adminRoute).not.toContain("beforeLoad:");
  });

  it("keeps closed swipe actions semantically non-interactive", () => {
    const swipeRow = source("src/components/interaction/SolarisSwipeActionRow.tsx");
    expect(swipeRow).toContain("aria-hidden={!open}");
    expect(swipeRow).toContain("disabled={!open}");
    expect(swipeRow).toContain("tabIndex={open ? 0 : -1}");
  });

  it("leaves app-launch immediately and restores only from root", () => {
    const launch = source("src/routes/app-launch.tsx");
    const coordinator = source("src/components/app/AppLaunchRestoreCoordinator.tsx");
    const installedApp = source("e2e/installed-app.e2e.ts");

    expect(launch).toContain("<ScriptOnce>{APP_LAUNCH_BOOTSTRAP_SCRIPT}</ScriptOnce>");
    expect(launch).toContain('if (window.location.pathname !== "/app-launch") return;');
    expect(launch).toContain('window.location.replace("/")');
    expect(launch).not.toContain("window.stop");
    expect(launch).not.toContain("setTimeout");
    expect(coordinator).toContain("readAppLaunchTransaction()");
    expect(coordinator).toContain("getAppLaunchDestinationFromSnapshot");
    expect(coordinator).toContain("clearAppLaunchTransaction()");
    expect(installedApp).not.toContain('page.goto("/app-launch"');
    expect(installedApp).toContain('window.location.assign("/app-launch")');
    expect(installedApp).toContain('new URL(request.url()).pathname === "/app-launch"');
  });
});