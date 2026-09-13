import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const homeRoute = source("src/routes/_authenticated/my-solaris/index.tsx");
const navigation = source("src/lib/my-solaris-navigation.ts");
const workspaceNav = source("src/components/mysolaris/MySolarisWorkspaceNav.tsx");
const historyRoute = source("src/routes/_authenticated/my-solaris/history.tsx");
const accountRoute = source("src/routes/_authenticated/my-solaris/account.tsx");
const accountPanel = source("src/components/MySolarisAccountPanel.tsx");
const hodPanel = source("src/components/CountryHodHistoryPanel.tsx");

describe("MySolaris dashboard", () => {
  it("uses the MySolaris brand and final grouped information architecture", () => {
    expect(homeRoute).toContain('title: "MySolaris — Solaris Studio"');
    for (const group of ["My edition", "My country", "My Solaris"]) {
      expect(navigation).toContain(`label: "${group}"`);
    }
    for (const section of [
      "Home",
      "Tasks",
      "Entry",
      "Voting",
      "Notices",
      "Country",
      "Page & media",
      "History",
      "Activity",
      "Predictions",
      "Saved",
      "Account",
    ]) {
      expect(navigation).toContain(`label: "${section}"`);
    }
    expect(workspaceNav).toContain('aria-label="MySolaris sections"');
    expect(workspaceNav).toContain('aria-label="MySolaris mobile sections"');
  });

  it("keeps Home task-first without exposing the transitional tab strip", () => {
    expect(homeRoute).not.toContain("<MySolarisTabs");
    expect(homeRoute).toContain("Next action");
    expect(homeRoute).toContain("Current edition");
    expect(homeRoute).toContain("Public page health");
    expect(homeRoute).toContain("<MySolarisOperationsPanel />");
  });

  it("renders HOD history on a focused route and keeps participation edition-canonical", () => {
    expect(historyRoute).toContain("<CountryHodHistoryPanel inline />");
    expect(hodPanel).toContain("return content");
    expect(homeRoute).toContain("entry.show_id == null");
    expect(homeRoute).toContain("One entry per SSC edition");
    expect(homeRoute).toContain("buildEditionProgressionPlacements");
  });

  it("puts private account and recovery-email controls on the Account route", () => {
    expect(accountRoute).toContain("<MySolarisAccountPanel />");
    expect(accountRoute).toContain("<MySolarisPasswordPanel />");
    expect(accountPanel).toContain("Add a recovery email");
    expect(accountPanel).toContain("Change email");
    expect(accountPanel).toContain("Solaris username");
    expect(accountPanel).toContain("Name or nickname");
  });
});
