import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const route = source("src/routes/_authenticated/my-solaris/index.tsx");
const accountPanel = source("src/components/MySolarisAccountPanel.tsx");
const hodPanel = source("src/components/CountryHodHistoryPanel.tsx");

describe("MySolaris dashboard", () => {
  it("uses the MySolaris brand and six focused sections", () => {
    expect(route).toContain('title: "MySolaris — Solaris Studio"');
    for (const tab of ["home", "entry", "country", "history", "activity", "account"]) {
      expect(route).toContain(`\"${tab}\"`);
    }
    expect(route).toContain('aria-label="MySolaris sections"');
  });

  it("keeps current-edition tasks, entry tools, country tools and activity in their own sections", () => {
    expect(route).toContain('tab === "home"');
    expect(route).toContain('tab === "entry"');
    expect(route).toContain('tab === "country"');
    expect(route).toContain('tab === "activity"');
    expect(route).toContain("Next action");
    expect(route).toContain("Current edition");
    expect(route).toContain("Public page health");
    expect(route).toContain("My Pulse");
  });

  it("renders HOD history directly and keeps participation history edition-canonical", () => {
    expect(route).toContain("<CountryHodHistoryPanel inline />");
    expect(hodPanel).toContain("if (inline) return content");
    expect(route).toContain("entry.show_id == null");
    expect(route).toContain("One entry per SSC edition");
    expect(route).toContain("buildEditionProgressionPlacements");
  });

  it("puts private account and recovery-email controls inside Account", () => {
    expect(route).toContain("<MySolarisAccountPanel />");
    expect(route).toContain("<MySolarisPasswordPanel />");
    expect(accountPanel).toContain("Add a recovery email");
    expect(accountPanel).toContain("Change email");
    expect(accountPanel).toContain("Solaris username");
    expect(accountPanel).toContain("Name or nickname");
  });
});
