import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Country Hub cutover", () => {
  it("retires the standalone Country Hub root into Me without losing organizer inspection", () => {
    const route = read("src/routes/_authenticated/country-hub/index.tsx");

    expect(route).toContain("if (search.country)");
    expect(route).toContain("NAV_TARGETS.mySolarisCountry");
    expect(route).toContain("NAV_TARGETS.mySolaris");
    expect(route).toContain("replace: true");
  });

  it("moves participant HOD responsibilities to Participate while preserving organizer inspection", () => {
    const route = read("src/routes/_authenticated/country-hub/hod.tsx");
    const tasks = read("src/components/mysolaris/modules/MySolarisTasksModule.tsx");

    expect(route).toContain("if (search.country)");
    expect(route).toContain("NAV_TARGETS.mySolarisTasks");
    expect(route).toContain("NAV_TARGETS.participate");
    expect(route).toContain("search, replace: true");
    expect(route).toContain("read-only MySolaris task surface");

    // The legacy HOD URL used to own all of these responsibilities. Organizer
    // country inspection remains on the proven task surface while the signed-in
    // participant enters the V3 Participate owner.
    expect(tasks).toContain("loadStudio2HodWorkspace");
    expect(tasks).toContain("listStudio2EligibilityOverrides");
    expect(tasks).toContain("acknowledgeStudio2Notice");
    expect(tasks).toContain("organizerInspection");
    expect(tasks).toContain("Participant View · read-only");
    expect(tasks).toContain("Country jury");
    expect(tasks).toContain("Submission review history");
    expect(tasks).toContain("Official notices");
  });

  it("keeps HOD identity/history in Me without mixing organizer country overrides into private history", () => {
    const root = read("src/components/v3/V3MeRoot.tsx");
    const historyRoute = read("src/routes/_authenticated/my-solaris/history.tsx");
    const historyScreen = read("src/components/v3/V3DelegationHistoryScreen.tsx");

    expect(root).toContain("NAV_TARGETS.mySolarisHistory");
    expect(historyRoute).toContain("isAppMode && !country");
    expect(historyRoute).toContain('return <MySolarisCountryModule section="history" />');
    expect(historyScreen).toContain("useSetOwnedHodEditionStatus");
    expect(historyScreen).toContain("useSetOwnedHodAutoAssign");
    expect(historyScreen).toContain("Automatically add future editions");
    expect(historyScreen).toContain("Your HOD role in this edition");
  });

  it("keeps every retained Country Hub specialist URL mapped to its canonical owner", () => {
    const notices = read("src/routes/_authenticated/country-hub/notices.tsx");
    const pageBuilder = read("src/routes/_authenticated/country-hub/page-builder.tsx");
    const readiness = read("src/routes/_authenticated/country-hub/readiness.tsx");
    const theme = read("src/routes/_authenticated/country-hub/theme.tsx");
    const entry = read("src/routes/_authenticated/my-solaris/entry.tsx");

    expect(notices).toContain("NAV_TARGETS.mySolarisNotices");
    expect(pageBuilder).toContain("NAV_TARGETS.mySolarisPageBuilder");
    expect(readiness).toContain("NAV_TARGETS.mySolarisEntry");
    expect(readiness).toContain('view: "readiness"');
    expect(theme).toContain("NAV_TARGETS.mySolarisTheme");
    expect(entry).toContain("V3EntryRouteGate");
    expect(entry).toContain("organizerInspection={Boolean(search.country)}");
  });

  it("surfaces delegation tools from capability state rather than the display role", () => {
    const root = read("src/components/v3/V3MeRoot.tsx");
    const screen = read("src/components/v3/V3MeScreen.tsx");
    const projection = read("src/lib/v3-me.ts");

    expect(root).toContain("workspace.permissions.canManageCountry");
    expect(root).toContain('workspace.permissions.countryStatus === "active"');
    expect(root).toContain("delegationLinks: canManageDelegation");
    expect(root).toContain("NAV_TARGETS.mySolarisCountry");
    expect(root).toContain("NAV_TARGETS.mySolarisHistory");
    expect(root).toContain("NAV_TARGETS.participate");
    expect(root).toContain("NAV_TARGETS.mySolarisEntry");
    expect(root).toContain("NAV_TARGETS.mySolarisNotices");
    expect(root).toContain("NAV_TARGETS.mySolarisPageBuilder");
    expect(root).toContain("NAV_TARGETS.mySolarisTheme");
    expect(screen).toContain("projection.delegation.length");
    expect(projection).toContain("delegationLinks?: readonly V3MeLink[]");
    expect(projection).not.toMatch(/displayRole\s*===|displayRole\s*!==/);
  });
});
