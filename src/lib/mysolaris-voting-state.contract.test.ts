import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const voting = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/my-solaris/voting.tsx"),
  "utf8",
);

describe("MySolaris voting state truth", () => {
  it("does not infer a closed jury window when Organizer Participant View has no country-scoped window context", () => {
    expect(voting).toContain(
      "const juryWindowOpen: boolean | null = organizerInspection",
    );
    expect(voting).toContain('"Window state unavailable"');
  });

  it("projects Jury schedule and eligibility instead of treating every non-open state as closed", () => {
    expect(voting).toContain("resolveScheduleState");
    expect(voting).toContain("juryWindowUpcoming");
    expect(voting).toContain('"Opening soon"');
    expect(voting).toContain('"Upcoming"');
    expect(voting).toContain('"Not eligible"');
    expect(voting).toContain('label={juryWindowUpcoming ? "Opens" : "Deadline"}');
  });

  it("uses the shared V3 projection for current-edition Televote status instead of a duplicate browser round query", () => {
    expect(voting).toContain("useV3PrimarySurfaceBundle");
    expect(voting).toContain('(action) => action.kind === "televote"');
    expect(voting).toContain("The dedicated Televoting workflow remains");
    expect(voting).toContain("the authority for ballot submission.");
    expect(voting).not.toContain("@/integrations/televoting/client");
    expect(voting).not.toContain("loadOpenTelevote");
    expect(voting).not.toContain('.from("rounds")');
  });

  it("reconciles an existing accepted Televote receipt before presenting an open round as a fresh action", () => {
    expect(voting).toContain("reconcileMergedTelevotingRecoveryCookie");
    expect(voting).toContain('"mysolaris-televote-receipt"');
    expect(voting).toContain('"Checking receipt"');
    expect(voting).toContain('"Receipt unknown"');
    expect(voting).toContain('"Submitted"');
    expect(voting).toContain("Receipt status unavailable");
    expect(voting).toContain("View recorded vote");
  });

  it("avoids background polling from the overview while keeping focus reconciliation for scoped and receipt reads", () => {
    expect(voting).not.toContain("refetchInterval:");
    expect(voting.match(/refetchOnWindowFocus: true/g)?.length ?? 0).toBeGreaterThanOrEqual(
      3,
    );
  });
});
