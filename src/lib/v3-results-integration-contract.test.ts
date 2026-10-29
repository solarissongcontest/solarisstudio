import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_RESULTS_INTEGRATION_CONTRACT, validateV3ResultsIntegrationContract } from "./v3-results-integration-contract";

const resultSource = readFileSync("src/integrations/v3/results-source.server.ts", "utf8");
const snapshotSource = readFileSync("src/lib/v3-public-result-snapshots.ts", "utf8");

describe("#1400 / shared V3 Results integration contract", () => {
  it("keeps Results mutation internals frozen while declaring the shared semantic boundary", () => {
    expect(validateV3ResultsIntegrationContract(V3_RESULTS_INTEGRATION_CONTRACT)).toEqual([]);
    expect(V3_RESULTS_INTEGRATION_CONTRACT.frozenImplementationOwner).toBe("PR #1400");
    expect(V3_RESULTS_INTEGRATION_CONTRACT.sharedBranchMayImplementResultsMutationInternals).toBe(false);
  });

  it("requires immutable publication/version readback on the shared Public side", () => {
    expect(resultSource).toContain("loadPublicResultSnapshots");
    expect(resultSource).toContain("snapshot.resultVersion !== snapshots.get(selectedShow.id)!.resultVersion");
    expect(resultSource).toContain("snapshot.publicationVersion !== snapshots.get(selectedShow.id)!.publicationVersion");
    expect(resultSource).toContain("Published results changed during this read");
    expect(snapshotSource).toContain("resultVersion");
    expect(snapshotSource).toContain("publicationVersion");
  });
});
