import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-release-candidate-evidence.ts"),
    "utf8",
  );

describe("Solaris Studio V3 release candidate evidence architecture", () => {
  it("consumes the critical workflow gate instead of redefining its safety logic", () => {
    const candidate = source();

    expect(candidate).toContain('from "./v3-workflow-cutover-gate"');
    expect(candidate).toContain("V3WorkflowCutoverDecision");
    expect(candidate).not.toContain("canonicalReadReady");
    expect(candidate).not.toContain("idempotencyProtection");
    expect(candidate).not.toContain("authoritativeReceipts");
    expect(candidate).not.toContain("duplicateEvidenceReconciliation");
  });

  it("does not recalculate rollout-observability thresholds", () => {
    const candidate = source();

    expect(candidate).not.toContain("evaluateV3RolloutObservability");
    expect(candidate).not.toContain("maxBootstrapFailureRate");
    expect(candidate).not.toContain("maxRuntimeErrorsPerSession");
    expect(candidate).not.toContain("minExposedSessions");
    expect(candidate).toContain(
      "Structural output compatible with the dedicated rollout-observability slice",
    );
  });

  it("binds every evidence class to exact code and stable deployment identity", () => {
    const candidate = source();

    expect(candidate).toContain("full 40-character commit SHA");
    expect(candidate).toContain("deploymentIdentityKey: string");
    expect(candidate).toContain("assertBoundEvidence");
    expect(candidate).toContain("belongs to candidate");
    expect(candidate).toContain("belongs to a different deployment identity");
    expect(candidate).toContain(
      "same code can run against another schema or",
    );
  });

  it("returns deployment identity with the release decision so downstream rollout does not accept a second caller-owned identity", () => {
    const candidate = source();

    expect(candidate).toContain("export type V3ReleaseCandidateDecision");
    expect(candidate).toContain("deploymentIdentityKey: string");
    expect(candidate).toContain("deploymentIdentityKey,");
  });

  it("requires durable evidence references instead of naked booleans", () => {
    const candidate = source();

    expect(candidate).toContain("evidenceRef");
    expect(candidate).toContain("observedAt");
    expect(candidate).toContain("must not be empty");
  });

  it("cannot become a deployment switch, database client or network verifier", () => {
    const candidate = source();

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
      expect(candidate).not.toContain(forbidden);
    }
  });

  it("never manufactures release evidence timestamps or deployment identity", () => {
    const candidate = source();

    expect(candidate).not.toContain("Date.now(");
    expect(candidate).not.toContain("new Date(");
    expect(candidate).not.toContain("randomUUID");
    expect(candidate).not.toContain("crypto.randomUUID");
  });

  it("requires deployed-candidate verification and promotion-stage evidence", () => {
    const candidate = source();

    expect(candidate).toContain("verification.${gate}.missing");
    expect(candidate).toContain("wrong_stage");
    expect(candidate).toContain("observability.wrong_target");
    expect(candidate).toContain("before its observation window ends");
  });
});
