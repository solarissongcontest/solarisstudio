import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

// The real SQL rehearsal verifies auth.uid(), historical receipt identity,
// equal-timestamp keysets, private-ledger denial and an actual Jury operation.
// Adapter tests verify account-switch cache isolation and error propagation.
describe("accepted recipient Activity cutover", () => {
  it("links the recipient-owned Public surface to its complete stateful and account-isolation proof", () => {
    const capability = V3_PUBLIC_CAPABILITY_REGISTRY.find((row) => row.id === "participant-activity")!;
    expect(capability.specificationStatus).toBe("cutover");
    expect(capability.backendOwners).toEqual(["activity"]);
    expect(capability.authRequirement).toBe("authenticated");
    expect(capability.migrationEvidence).toContain(".github/tests/v3-participant-activity.sql");
    expect(capability.migrationEvidence).toContain("src/lib/v3-participant-activity-adapter.test.ts");
    expect(capability.migrationEvidence).toContain("src/lib/v3-participant-activity-response.test.ts");
    for (const path of capability.migrationEvidence.split("; ")) expect(existsSync(path), path).toBe(true);
  });

  it("does not promote private delegation history or public Pulse from recipient Activity proof", () => {
    expect(V3_PUBLIC_CAPABILITY_REGISTRY.find((row) => row.id === "delegation-history")?.specificationStatus).toBe("mapped");
  });
});
