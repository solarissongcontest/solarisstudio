import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  "src/components/televoting/VotingResultsWorkspace.tsx",
  "utf8",
);
const resultsView = readFileSync(
  "src/components/televoting/VotingResultsView.tsx",
  "utf8",
);

describe("V3 Organizer public voting results scope", () => {
  it("resolves the Televoting edition from the exact Organizer edition", () => {
    expect(workspace).toContain("useAdminContext()");
    expect(workspace).toContain("getMergedTelevotingRoundsPage");
    expect(workspace).toContain('queryKey: ["merged-televoting-results-edition", actorId, editionId]');
    expect(workspace).toContain("getRoundsPage({ data: { editionId } })");
    expect(workspace).toContain("enabled: Boolean(actorId && editionId)");
    expect(workspace).not.toContain("getMergedTelevotingRounds()");
  });

  it("passes only the selected edition round projection into the result operator", () => {
    expect(workspace).toContain("key={`${actorId}:${editionId}`}");
    expect(workspace).toContain("editionId={editionId}");
    expect(workspace).toContain("rounds={data.edition.rounds}");
    expect(resultsView).toContain("rounds: readonly MergedAdminRound[]");
    expect(resultsView).toContain("const scopedRounds = useMemo(");
    expect(resultsView).toContain("scopedRounds.some((round) => round.id === roundId)");
    expect(resultsView).toContain('["merged-televoting-conversion", actorId, editionId, effectiveRoundId]');
  });

  it("partitions private current and historical results plus confirmed readbacks by actor", () => {
    expect(workspace).toContain("const actorId = useAuthenticatedUser().id");
    expect(resultsView).toContain("const actorId = useAuthenticatedUser().id");
    expect(workspace).toContain('["merged-televoting-archive-result", actorId, edition.solaris_id, effectiveRoundId]');
    expect(workspace).toContain('key={`${actorId}:${data.edition.solaris_id}`}');
    expect(resultsView).toContain('queryKey: ["merged-televoting-admin", actorId]');
    expect(resultsView).toContain("target.actorId, target.editionId, target.roundId");
    expect(resultsView).toContain("roundId: effectiveRoundId, editionId, actorId, confirmProtected:");
    expect(workspace.match(/gcTime: 0/g)).toHaveLength(2);
    expect(resultsView.match(/gcTime: 0/g)).toHaveLength(2);
    expect(resultsView).toContain("refetchOnWindowFocus: false");
  });

  it("does not claim governed write parity while result lifecycle commands remain legacy", () => {
    expect(resultsView).toContain("recalculateMergedConversion");
    expect(resultsView).toContain("setMergedResultsStatus");
    expect(resultsView).not.toContain("operationId");
    expect(resultsView).not.toContain("idempotencyKey");
  });
});
