import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const entry = source(
  "src/components/mysolaris/modules/MySolarisEntryModule.tsx",
);
const voting = source("src/routes/_authenticated/my-solaris/voting.tsx");

describe("focused MySolaris entry and voting workspaces", () => {
  it("splits Entry into the six promised participant sections", () => {
    expect(entry).toContain(
      'type EntrySection = "overview" | "details" | "media" | "eligibility" | "readiness" | "history"',
    );
    for (const label of [
      "Overview",
      "Details",
      "Media",
      "Eligibility",
      "Readiness",
      "History",
    ]) {
      expect(entry).toContain(`label: "${label}"`);
    }
    expect(entry).toContain('aria-label="Entry sections"');
  });

  it("routes readiness problems to the editor that owns the fix", () => {
    expect(entry).toContain("function EntryActionLink");
    expect(entry).toContain('to="/confirmations"');
    expect(entry).toContain("NAV_TARGETS.mySolarisTasks");
    expect(entry).toContain("Each action opens the owning editor.");
  });

  it("shows participant voting status without exposing internal identity mechanics", () => {
    expect(voting).toContain('label="Assigned HOD"');
    expect(voting).toContain('label="Ballot status"');
    expect(voting).toContain('label="Deadline"');
    expect(voting).toContain("loadOpenTelevote");
    expect(voting).toContain(
      "Internal voter identities, integrity signals and organizer controls remain",
    );
  });
});
