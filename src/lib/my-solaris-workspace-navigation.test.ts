import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const shell = source("src/components/AppShell.tsx");
const workspaceShell = source("src/components/mysolaris/MySolarisWorkspaceShell.tsx");
const workspaceNav = source("src/components/mysolaris/MySolarisWorkspaceNav.tsx");
const workspaceContext = source("src/components/mysolaris/MySolarisContext.tsx");
const operationsPanel = source("src/components/MySolarisOperationsPanel.tsx");
const targets = source("src/lib/navigation-targets.ts");
const homeRoute = source("src/routes/_authenticated/my-solaris/index.tsx");
const votingRoute = source("src/routes/_authenticated/my-solaris/voting.tsx");
const tasksRoute = source("src/routes/_authenticated/my-solaris/tasks.tsx");
const entryRoute = source("src/routes/_authenticated/my-solaris/entry.tsx");
const noticesRoute = source("src/routes/_authenticated/my-solaris/notices.tsx");
const countryRoute = source("src/routes/_authenticated/my-solaris/country.tsx");

describe("MySolaris product consolidation", () => {
  it("keeps one persistent local shell on every MySolaris route", () => {
    expect(shell).toContain("import { MySolarisWorkspaceShell }");
    expect(shell).toContain('pathname.startsWith("/my-solaris/")');
    expect(shell).toContain("<MySolarisWorkspaceShell>{children}</MySolarisWorkspaceShell>");
    expect(workspaceShell).toContain("<MySolarisProvider>");
    expect(workspaceShell).toContain("<MySolarisWorkspaceNav />");
    expect(workspaceNav).toContain('aria-label="MySolaris sections"');
    expect(workspaceNav).toContain('aria-label="MySolaris mobile sections"');
  });

  it("uses a desktop rail and a compact Home, Tasks, Entry, Voting, More mobile navigation", () => {
    expect(workspaceShell).toContain("lg:grid-cols-[13.5rem_minmax(0,1fr)]");
    expect(workspaceNav).toContain("MY_SOLARIS_MOBILE_PRIMARY_IDS");
    expect(workspaceNav).toContain("<MoreHorizontal");
    expect(workspaceNav).toContain("More");
    expect(shell).toContain("!isMySolarisWorkspace && (");
  });

  it("loads shared participant context once at the workspace shell", () => {
    for (const contract of [
      "user:",
      "countryAccount:",
      "currentEdition:",
      "currentEntry:",
      "permissions:",
      "capabilities:",
      "taskCounts:",
      "unreadNoticeCount:",
      "deadlines:",
    ]) {
      expect(workspaceContext).toContain(contract);
    }
    expect(workspaceContext).toContain("isStudio2FeatureEnabled");
    expect(workspaceContext).toContain("loadStudio2NoticeInbox");
  });

  it("does not bury MySolaris inside the public page directory", () => {
    expect(shell).toContain('!pathname.startsWith("/my-solaris")');
    expect(shell).toContain("showPublicSidebar");
  });

  it("keeps participant tools on the canonical MySolaris route family", () => {
    for (const target of [
      "mySolarisTasks",
      "mySolarisEntry",
      "mySolarisVoting",
      "mySolarisNotices",
      "mySolarisCountry",
      "mySolarisHistory",
      "mySolarisActivity",
      "mySolarisPredictions",
      "mySolarisSaved",
      "mySolarisAccount",
    ]) {
      expect(targets).toContain(`${target}: "/my-solaris/`);
    }
    expect(workspaceNav).not.toContain('to: "/country-hub');
  });

  it("has real canonical route surfaces behind the primary workspace destinations", () => {
    expect(tasksRoute).toContain('createFileRoute("/_authenticated/my-solaris/tasks")');
    expect(entryRoute).toContain('createFileRoute("/_authenticated/my-solaris/entry")');
    expect(votingRoute).toContain('createFileRoute("/_authenticated/my-solaris/voting")');
    expect(noticesRoute).toContain('createFileRoute("/_authenticated/my-solaris/notices")');
    expect(countryRoute).toContain('createFileRoute("/_authenticated/my-solaris/country")');
  });

  it("keeps Home task-first and removes the transitional tab strip", () => {
    expect(homeRoute).not.toContain("<MySolarisTabs");
    expect(homeRoute).toContain("<MySolarisOperationsPanel />");
    expect(operationsPanel).toContain("NAV_TARGETS.mySolarisVoting");
  });

  it("does not resurrect a separate Studio 2 participant launcher", () => {
    expect(shell).not.toContain("HodWorkspaceLauncher");
    expect(shell).not.toContain("MySolarisPortalExtension");
    expect(workspaceNav).not.toContain("Studio 2 workspace");
  });
});
