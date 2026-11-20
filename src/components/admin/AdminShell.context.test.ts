import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/admin/AdminShell.tsx", "utf8");
const tasks = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");

describe("Organizer Tasks single edition context", () => {
  it("does not stack the global edition banner over the page's own edition banner", () => {
    expect(shell).toContain('const pageOwnsContextLock = pathname === "/admin/operations" || pathname === "/admin/tasks";');
    expect(shell).toContain("showContextLock={!pageOwnsContextLock}");
    expect(tasks).toContain('data-v3-organizer-context-lock="edition"');
    expect(tasks).toContain("resolvedEditionId");
  });

  it("does not remove the global context banner from other Organizer pages", () => {
    expect(shell).toContain('data-organizer-context-lock=""');
    expect(shell).toContain("showContextLock && editionId");
  });
});
