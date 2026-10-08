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

    expect(countries).toContain('aria-label="Search countries"');
    expect(countries).toContain('aria-label="Filter countries by readiness"');
    expect(selectors).toContain('aria-label="Search editions"');
    expect(countryPicker).toContain('aria-label="Search country"');
  });

  it("authorizes Organizer routes in a mounted fail-closed gate without a nested async route guard", () => {
    const authenticated = source("src/routes/_authenticated/route.tsx");
    const organizerGate = source("src/components/admin/OrganizerAccessGate.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");

    expect(authenticated).toContain('pathname === "/admin"');
    expect(authenticated).toContain('pathname.startsWith("/admin/")');
    expect(authenticated).toContain("<OrganizerAccessGate");
    expect(authenticated).not.toContain("hasSolarisOrganizerAccess");
    expect(authenticated).not.toContain("beforeLoad:");
    expect(authenticated).toContain("AuthenticatedSessionGate");
    expect(authenticated).toContain("beginLifecycleGeneration(generationRef)");

    expect(organizerGate).toContain("useEffect");
    expect(organizerGate).toContain("hasSolarisOrganizerAccess(userId)");
    expect(organizerGate).not.toContain('.from("user_roles")');
    expect(organizerGate).toContain('to: "/my-solaris"');
    expect(organizerGate).toContain('notice: "organizer-access-required"');
    expect(organizerGate).toContain("replace: true");
    expect(organizerGate).toContain('state === "allowed"');

    expect(adminRoute).not.toContain("hasSolarisOrganizerAccess");
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

    expect(launch).toContain("<ScriptOnce>{APP_LAUNCH_BOOTSTRAP_SCRIPT}</ScriptOnce>");
    expect(launch).toContain('if (window.location.pathname !== "/app-launch") return;');
    expect(launch).toContain('window.location.replace("/")');
    expect(launch).not.toContain("window.stop");
    expect(launch).not.toContain("setTimeout");
    expect(coordinator).toContain("readAppLaunchTransaction()");
    expect(coordinator).toContain("getAppLaunchDestinationFromSnapshot");
    expect(coordinator).toContain("clearAppLaunchTransaction()");
  });
});
