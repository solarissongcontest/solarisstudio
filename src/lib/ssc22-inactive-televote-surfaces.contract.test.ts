import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("inactive countries cannot leak into a current televote", () => {
  it("syncs only confirmed country participants from Solaris", () => {
    expect(source("src/integrations/televoting/solaris-sync.server.ts"))
      .toContain('.eq("participation_status", "confirmed")');
  });

  it("checks linked round parity at public readiness, preflight and final submission", () => {
    const readiness = source("src/integrations/televoting/status.functions.ts");
    const preflight = source("src/integrations/televoting/preflight.server.ts");
    const submit = source("src/integrations/televoting/vote.server.ts");
    expect(readiness).toContain("getMergedTelevotingRoundRosterReady");
    expect(readiness).toContain("assertLinkedTelevoteRosterCurrent(data.roundId)");
    expect(preflight).toContain("await assertLinkedTelevoteRosterCurrent(input.roundId)");
    expect(submit).toContain("await assertLinkedTelevoteRosterCurrent(data.roundId)");
  });

  it("does not expose stale round entries while its authoritative roster is unverified", () => {
    const page = source("src/routes/televoting/index.tsx");
    expect(page).toContain("checkRoundRoster({ data: { roundId } })");
    expect(page).toContain("votingReady: backend.votingReady && roster.ready");
    expect(page).toContain("serverStatus?.rosterReady === false");
    expect(page).not.toContain("data.entries.map((entry) => (");
  });

  it("preserves historical unbound editions but blocks current canonical unbound rounds", () => {
    const guard = source("src/integrations/televoting/participation-guard.server.ts");
    expect(guard).toContain('if (edition.status === "active")');
    expect(guard).toContain("linkedTelevoteRosterMatches(activeCodes, remoteCodes)");
  });
});
