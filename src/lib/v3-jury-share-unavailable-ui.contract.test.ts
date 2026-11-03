import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/v3/V3JuryShareUnavailableSheet.tsx", "utf8");

describe("V3 Jury Share unavailable UI", () => {
  it("surfaces canonical pre-publication and invalid-ballot states without inventing data", () => {
    expect(source).toContain("Share after results");
    expect(source).toContain("Ballot not final");
    expect(source).toContain("Jury vote unavailable");
    expect(source).toContain("publication-safe official jury ballot");
    expect(source).not.toContain("jury_votes");
    expect(source).not.toContain("jury_ballot_submissions");
    expect(source).not.toContain("supabase");
  });

  it("uses the responsive Solaris sheet and makes the authority boundary explicit", () => {
    expect(source).toContain('side="responsive"');
    expect(source).toContain("This state comes from Solaris publication and ballot authority");
    expect(source).toContain("changing the device clock cannot unlock it");
    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("Date.now");
  });
});
