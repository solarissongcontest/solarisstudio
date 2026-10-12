import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-rollout-promotion-sequence.ts"),
    "utf8",
  );

describe("Solaris Studio V3 rollout promotion architecture", () => {
  it("consumes candidate-bound release evidence instead of re-evaluating safety gates", () => {
    const promotion = source();
    expect(promotion).toContain('from "./v3-release-candidate-evidence"');
    expect(promotion).toContain("V3ReleaseCandidateDecision");
    expect(promotion).not.toContain("canonicalReadReady");
    expect(promotion).not.toContain("evaluateV3WorkflowCutover");
    expect(promotion).not.toContain("evaluateV3RolloutObservability");
  });

  it("binds active rollout state to stable deployment identity", () => {
    const promotion = source();
    expect(promotion).toContain("deploymentIdentityKey: string");
    expect(promotion).toContain("currentDeploymentIdentityKey");
    expect(promotion).toContain("deploymentChanged");
    expect(promotion).toContain("deployment_changed_restart_shadow");
    expect(promotion).toContain("Policy revisions belong to the observation scope");
    expect(promotion).not.toContain("rolloutPolicyUpdatedAt");
  });

  it("enforces sequential promotion and deployment restart at shadow", () => {
    const promotion = source();
    expect(promotion).toContain("non_sequential_promotion");
    expect(promotion).toContain("deployment_changed_restart_shadow");
    expect(promotion).toContain('input.to !== "shadow"');
    expect(promotion).toContain("isSequentialPromotion");
  });

  it("uses externally supplied observation policy instead of hard-coded rollout durations", () => {
    const promotion = source();
    expect(promotion).toContain("minShadowObservationMs");
    expect(promotion).toContain("minLimitedObservationMs");
    expect(promotion).toContain("minFullObservationMsBeforeRetirement");
    expect(promotion).not.toContain("86400000");
    expect(promotion).not.toContain("60 * 60");
  });

  it("keeps rollback immediate while preserving exact active deployment identity", () => {
    const promotion = source();
    expect(promotion).toContain("rollbackV3Rollout");
    expect(promotion).toContain("Safety rollback is deliberately immediate");
    expect(promotion).toContain("preserves the exact active deployment identity");
    expect(promotion).not.toContain("rollbackEvidence");
  });

  it("clears code and deployment identity on rollback to legacy", () => {
    const promotion = source();
    expect(promotion).toContain("candidateSha: null");
    expect(promotion).toContain("deploymentIdentityKey: null");
    expect(promotion).toContain("Legacy rollout state cannot carry V3 candidate/deployment identity");
  });

  it("cannot own deployment, database, browser storage or network behavior", () => {
    const promotion = source();
    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useQuery(",
      "useMutation(",
      "setInterval(",
      "setTimeout(",
      "redirect(",
      "navigate(",
    ]) {
      expect(promotion).not.toContain(forbidden);
    }
  });

  it("never manufactures rollout time or deployment identity on the client", () => {
    const promotion = source();
    expect(promotion).not.toContain("Date.now(");
    expect(promotion).not.toContain("new Date(");
    expect(promotion).not.toContain("randomUUID");
    expect(promotion).not.toContain("crypto.randomUUID");
  });

  it("treats legacy retirement as terminal for staged-rollout rollback", () => {
    const promotion = source();
    expect(promotion).toContain('input.current.stage === "retired"');
    expect(promotion).toContain(
      "Retired legacy cannot be restored through staged-rollout rollback",
    );
    expect(promotion).toContain(
      "disaster recovery after legacy removal belongs to deployment rollback",
    );
  });
});
