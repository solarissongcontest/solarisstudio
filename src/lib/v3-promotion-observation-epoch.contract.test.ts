import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-promotion-observation-epoch.ts"),
    "utf8",
  );

describe("Solaris Studio V3 promotion observation epoch architecture", () => {
  it("composes the rollout ledger instead of redefining promotion persistence", () => {
    const epoch = source();
    expect(epoch).toContain('from "./v3-rollout-state-ledger"');
    expect(epoch).toContain("applyV3RolloutPromotion");
    expect(epoch).not.toContain("evaluateV3WorkflowCutover");
    expect(epoch).not.toContain("evaluateV3RolloutObservability");
    expect(epoch).not.toContain("revision: input.current.revision + 1");
  });

  it("uses a structural #508-compatible certificate without regenerating identity", () => {
    const epoch = source();
    expect(epoch).toContain("Structural subset of the runtime-bound observability certificate from #508");
    expect(epoch).toContain("deploymentIdentityKey: string");
    expect(epoch).toContain("observationIdentityKey: string");
    expect(epoch).toContain("windowStart: string");
    expect(epoch).toContain("windowEnd: string");
    expect(epoch).not.toContain("deploymentRef");
    expect(epoch).not.toContain("schemaRevision");
    expect(epoch).not.toContain("rolloutPolicyUpdatedAt");
  });

  it("binds evidence to exact persisted stage or observation epoch", () => {
    const epoch = source();
    expect(epoch).toContain("input.current.state.enteredAt");
    expect(epoch).toContain("window_predates_stage_epoch");
    expect(epoch).toContain("stage/observation epoch");
    expect(epoch).toContain("input.current.state.deploymentIdentityKey");
    expect(epoch).toContain("candidate_mismatch");
    expect(epoch).toContain("deployment_mismatch");
  });

  it("keeps stable deployment identity separate from policy-specific observation identity", () => {
    const epoch = source();
    expect(epoch).toContain("deploymentIdentityKey");
    expect(epoch).toContain("observationIdentityKey");
    expect(epoch).toContain("Deployment identity proves which code/deployment/schema is running");
    expect(epoch).toContain("observation identity additionally scopes the rollout-policy revision");
  });

  it("requires stage-specific observability for each upward promotion", () => {
    const epoch = source();
    expect(epoch).toContain('case "limited"');
    expect(epoch).toContain('return "shadow"');
    expect(epoch).toContain('case "full"');
    expect(epoch).toContain('return "limited"');
    expect(epoch).toContain('case "retired"');
    expect(epoch).toContain('return "full"');
  });

  it("does not let future or pre-epoch telemetry become promotion proof", () => {
    const epoch = source();
    expect(epoch).toContain("window_ends_in_future");
    expect(epoch).toContain("evidence_observed_in_future");
    expect(epoch).toContain("observation.observedAt cannot be before its observation window ends");
  });

  it("preserves stale-revision and cutover authority from the underlying ledger", () => {
    const epoch = source();
    expect(epoch).toContain('if (base.status !== "applied") return base');
    expect(epoch).toContain('status: "observation_blocked"');
    expect(epoch).toContain("record: input.current");
  });

  it("stores release and observation evidence references without ambiguous concatenation", () => {
    const epoch = source();
    expect(epoch).toContain("createV3PromotionEvidenceBundleRef");
    expect(epoch).toContain("lengthPrefixed");
    expect(epoch).toContain("releaseEvidenceRef");
    expect(epoch).toContain("observationEvidenceRef");
  });

  it("cannot own persistence, network, browser state, polling or client time", () => {
    const epoch = source();
    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      ".from(",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useQuery(",
      "useMutation(",
      "setInterval(",
      "setTimeout(",
      "Date.now(",
      "new Date(",
    ]) {
      expect(epoch).not.toContain(forbidden);
    }
  });
});
