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

  it("authorizes Organizer routes in the existing authenticated boundary without a nested async guard", () => {
    const authenticated = source("src/routes/_authenticated/route.tsx");
    const adminRoute = source("src/routes/_authenticated/admin/route.tsx");

    expect(authenticated).toContain('location.pathname === "/admin"');
    expect(authenticated).toContain('location.pathname.startsWith("/admin/")');
    expect(authenticated).toContain("await hasSolarisOrganizerAccess(data.user.id)");
    expect(authenticated).toContain('notice: "organizer-access-required"');
    expect(authenticated).toContain("replace: true");

    expect(adminRoute).not.toContain("hasSolarisOrganizerAccess");
    expect(adminRoute).not.toContain("supabase.auth.getUser");
    expect(adminRoute).not.toContain("beforeLoad:");
  });

  it("keeps the absolute app-launch escape armed until the document has actually left", () => {
    const launch = source("src/routes/app-launch.tsx");
    const lifecycle = source("src/lib/app-launch-lifecycle.ts");

    expect(launch).toContain("<ScriptOnce>{APP_LAUNCH_BOOTSTRAP_SCRIPT}</ScriptOnce>");
    expect(launch).toContain("window[timerKey] = window.setTimeout(leave, remaining);");
    expect(launch).toContain('if (window.location.pathname !== "/app-launch") return;');
    expect(launch).not.toContain("clearPreHydrationEscape");
    expect(launch).not.toMatch(
      /function leaveLaunchRoute[\s\S]*?window\.clearTimeout[\s\S]*?window\.location\.replace/,
    );
    expect(lifecycle).toContain("APP_LAUNCH_ABSOLUTE_ESCAPE_MS = 3_000");
  });
});
