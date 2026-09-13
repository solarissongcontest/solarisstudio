import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const shell = source("src/components/AppShell.tsx");
const workspaceNav = source("src/components/mysolaris/MySolarisWorkspaceNav.tsx");
const targets = source("src/lib/navigation-targets.ts");
const votingRoute = source("src/routes/_authenticated/my-solaris/voting.tsx");
const tasksRoute = source("src/routes/_authenticated/my-solaris/tasks.tsx");
const entryRoute = source("src/routes/_authenticated/my-solaris/entry.tsx");
const noticesRoute = source("src/routes/_authenticated/my-solaris/notices.tsx");
const countryRoute = source("src/routes/_authenticated/my-solaris/country.tsx");

describe("MySolaris product consolidation", () => {
  it("keeps one persistent workspace navigation on every MySolaris route", () => {
    expect(shell).toContain('import { MySolarisWorkspaceNav }');
    expect(shell).toContain('pathname.startsWith("/my-solaris/")');
    expect(shell).toContain("isMySolarisWorkspace && <MySolarisWorkspaceNav />");
    expect(workspaceNav).toContain('aria-label="MySolaris workspace"');
  });

  it("keeps participant tools on the canonical MySolaris route family", () => {
    expect(targets).toContain('mySolarisTasks: "/my-solaris/tasks"');
    expect(targets).toContain('mySolarisEntry: "/my-solaris/entry"');
    expect(targets).toContain('mySolarisVoting: "/my-solaris/voting"');
    expect(targets).toContain('mySolarisNotices: "/my-solaris/notices"');
    expect(targets).toContain('mySolarisCountry: "/my-solaris/country"');
    expect(workspaceNav).not.toContain('to: "/country-hub');
  });

  it("keeps all current delegation operations discoverable from the shared workspace rail", () => {
    for (const target of [
      "mySolarisTasks",
      "mySolarisEntry",
      "mySolarisVoting",
      "mySolarisNotices",
      "mySolarisCountry",
      "mySolarisPageBuilder",
      "mySolarisTheme",
    ]) {
      expect(workspaceNav).toContain(`NAV_TARGETS.${target}`);
    }
  });

  it("has real canonical route surfaces behind the primary workspace destinations", () => {
    expect(tasksRoute).toContain('createFileRoute("/_authenticated/my-solaris/tasks")');
    expect(entryRoute).toContain('createFileRoute("/_authenticated/my-solaris/entry")');
    expect(votingRoute).toContain('createFileRoute("/_authenticated/my-solaris/voting")');
    expect(noticesRoute).toContain('createFileRoute("/_authenticated/my-solaris/notices")');
    expect(countryRoute).toContain('createFileRoute("/_authenticated/my-solaris/country")');
  });

  it("does not resurrect a separate Studio 2 participant launcher", () => {
    expect(shell).not.toContain("HodWorkspaceLauncher");
    expect(shell).not.toContain("MySolarisPortalExtension");
    expect(workspaceNav).not.toContain("Studio 2 workspace");
  });
});
