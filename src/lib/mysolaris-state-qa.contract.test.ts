import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("MySolaris and Country Hub state QA", () => {
  const tasks = source("src/components/mysolaris/modules/MySolarisTasksModule.tsx");
  const entry = source("src/components/mysolaris/modules/MySolarisEntryModule.tsx");
  const notices = source("src/components/mysolaris/modules/MySolarisNoticesModule.tsx");
  const context = source("src/components/mysolaris/MySolarisContext.tsx");
  const participation = source("src/lib/participation-os.ts");

  it("handles missing, suspended and linked country states explicitly", () => {
    expect(tasks).toContain("No country selected");
    expect(tasks).toContain("Country account suspended");
    expect(notices).toContain("No delegation account");
    expect(notices).toContain("is suspended");
    expect(context).toContain('countryStatus: "active" | "suspended" | null');
    expect(context).toContain("canManageCountry");
  });

  it("handles missing edition and entry states without inventing work", () => {
    expect(tasks).toContain("No Solaris edition is linked to this delegation yet.");
    expect(entry).toContain("No Solaris edition is linked to this delegation yet.");
    expect(entry).toMatch(/No entry|entry/i);
    expect(tasks).toContain("No participant action is required for this edition right now.");
  });

  it("distinguishes overdue/missing work from completed submissions", () => {
    expect(participation).toContain('state: "completed"');
    expect(participation).toContain('state: "problem"');
    expect(participation).toContain("The voting window closed without a recorded submission.");
    expect(participation).toContain("Your submission has been received.");
    expect(participation).toContain("The official voting window is closed and Solaris has no recorded submission.");
  });

  it("covers empty, unread, acknowledgement-required and archived notice states", () => {
    expect(notices).toContain("No notices in this view");
    expect(notices).toContain('"acknowledgement_required"');
    expect(notices).toContain('"acknowledged"');
    expect(notices).toContain('"archived"');
    expect(notices).toContain("Acknowledge notice");
    expect(notices).toContain("Restore to inbox");
  });

  it("keeps legacy Country Hub URLs as aliases to canonical MySolaris states", () => {
    const aliases = {
      "index.tsx": "mySolarisCountry",
      "hod.tsx": "mySolarisTasks",
      "readiness.tsx": "mySolarisEntry",
      "notices.tsx": "mySolarisNotices",
      "page-builder.tsx": "mySolarisPageBuilder",
      "theme.tsx": "mySolarisTheme",
    } as const;

    for (const [file, target] of Object.entries(aliases)) {
      const route = source(`src/routes/_authenticated/country-hub/${file}`);
      expect(route).toContain(`NAV_TARGETS.${target}`);
      expect(route).toContain("replace: true");
    }
  });

  it("keeps the responsive workspace shell single-column before desktop", () => {
    const shell = source("src/components/mysolaris/MySolarisWorkspaceShell.tsx");
    expect(shell).toContain("min-w-0");
    expect(shell).toContain("lg:grid");
    expect(shell).toContain("lg:grid-cols-[13.5rem_minmax(0,1fr)]");
    expect(shell).toContain("xl:grid-cols-[14.5rem_minmax(0,1fr)]");
  });
});
