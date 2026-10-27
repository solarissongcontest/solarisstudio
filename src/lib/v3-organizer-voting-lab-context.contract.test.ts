import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const votingLab = readFileSync("src/routes/_authenticated/admin/voting-lab.tsx", "utf8");
const scenarios = readFileSync("src/lib/voting-lab-scenarios.ts", "utf8");
const registry = readFileSync("src/lib/v3-organizer-capability-registry.ts", "utf8");

describe("V3 Organizer Voting Lab scope", () => {
  it("fails closed without an exact Organizer edition", () => {
    expect(votingLab).toContain("useParticipants(editionId ?? undefined)");
    expect(votingLab).toContain('title="Select an edition"');
    expect(votingLab).toContain("exact selected Organizer edition");
    expect(votingLab).not.toContain("editionId ?? 'all'");
  });

  it("uses deterministic synthetic ballots instead of submitted vote data", () => {
    expect(votingLab).toContain("buildSyntheticVotingLabBallots");
    expect(votingLab).toContain("Synthetic scenarios only");
    expect(votingLab).toContain("No submitted jury or televote ballot");
    expect(votingLab).not.toContain("getVotingLabData");
    expect(votingLab).not.toContain("voting-lab.functions");
    expect(votingLab).not.toContain("sanitized ballots");
    expect(votingLab).not.toContain("real submitted ballots");
    expect(scenarios).toContain("synthetic-voter-");
  });

  it("keeps the lab unable to publish or finalize official results", () => {
    expect(votingLab).toContain("nothing here can publish or finalize official results");
    expect(votingLab).not.toContain("publish_results");
    expect(votingLab).not.toContain("finalize_results");
    expect(votingLab).not.toContain(".insert(");
    expect(votingLab).not.toContain(".update(");
    expect(votingLab).not.toContain(".delete(");
  });

  it("records the accepted local Voting Lab without turning synthetic output into official state", () => {
    expect(registry).toContain('id === "live-review-voting-lab"');
  });
});
