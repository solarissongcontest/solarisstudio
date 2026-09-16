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
    expect(entry).toMatch(
      /type EntrySection =[\s\S]*"overview"[\s\S]*"details"[\s\S]*"media"[\s\S]*"eligibility"[\s\S]*"readiness"[\s\S]*"history";/,
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
    expect(entry).toContain("Open submission →");
    expect(entry).toContain("Open task →");
  });

  it("shows participant voting status without exposing internal identity mechanics", () => {
    expect(voting).toMatch(/label=\{"?Assigned HOD"?\}|label="Assigned HOD"/);
    expect(voting).toMatch(/label=\{"?Ballot status"?\}|label="Ballot status"/);
    expect(voting).toMatch(/label=\{"?Deadline"?\}|label="Deadline"/);
    expect(voting).toContain("loadOpenTelevote");
    expect(voting).toContain("Internal voter identities, integrity signals");
    expect(voting).toContain("and organizer controls remain in protected Organizer tools.");
  });
});
