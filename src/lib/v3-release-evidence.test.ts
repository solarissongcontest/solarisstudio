import { describe, expect, it } from "vitest";
import { buildV3ReleaseManifest } from "./v3-release-evidence";

const sha = "b".repeat(40);
const evidence = (gate_id: string, candidate_sha = sha) => ({
  schema_version: 1 as const,
  candidate_sha,
  gate_id,
  result: "pass" as const,
  workflow_run_id: `run-${gate_id}`,
  job_name: gate_id,
  produced_at: "2026-10-27T15:00:00Z",
  policy_version: "v3-release-doctrine-1",
});

describe("exact-SHA release manifest", () => {
  it("fails closed when required evidence is missing", () => {
    const manifest = buildV3ReleaseManifest({
      candidateSha: sha,
      releaseRisk: { hard_blocker: 0, conditional_blocker: 0, tracked_migration_debt: 4, obsolete_or_replaced: 1, unresolvedTotal: 5 },
      evidence: [evidence("s15-ownership")],
      requiredGates: ["s15-ownership", "s16-mutation-authority"],
    });
    expect(manifest.release_ready).toBe(false);
    expect(manifest.errors).toContain("s16-mutation-authority: required exact-SHA evidence missing");
  });

  it("rejects stale evidence from another SHA", () => {
    const manifest = buildV3ReleaseManifest({
      candidateSha: sha,
      releaseRisk: { hard_blocker: 0, conditional_blocker: 0, tracked_migration_debt: 0, obsolete_or_replaced: 0, unresolvedTotal: 0 },
      evidence: [evidence("s15-ownership", "c".repeat(40))],
      requiredGates: ["s15-ownership"],
    });
    expect(manifest.release_ready).toBe(false);
    expect(manifest.errors.some((error) => error.includes("does not match"))).toBe(true);
  });

  it("allows non-blocking debt only when every required gate passes", () => {
    const manifest = buildV3ReleaseManifest({
      candidateSha: sha,
      releaseRisk: { hard_blocker: 0, conditional_blocker: 0, tracked_migration_debt: 7, obsolete_or_replaced: 2, unresolvedTotal: 9 },
      evidence: [evidence("s15-ownership"), evidence("s16-mutation-authority")],
      requiredGates: ["s15-ownership", "s16-mutation-authority"],
    });
    expect(manifest.release_ready).toBe(true);
    expect(manifest.release_risk.tracked_migration_debt).toBe(7);
  });
});
