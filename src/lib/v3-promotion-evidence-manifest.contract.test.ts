import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-promotion-evidence-manifest.ts"),
    "utf8",
  );

describe("Solaris Studio V3 promotion evidence manifest architecture", () => {
  it("recomputes #505 release evidence instead of accepting a caller decision", () => {
    const manifest = source();
    const applyStart = manifest.indexOf(
      "export function applyV3PromotionEvidenceManifest",
    );
    const applySignatureEnd = manifest.indexOf(
      "): V3ObservedPromotionApplyResult",
      applyStart,
    );
    const applySignature = manifest.slice(applyStart, applySignatureEnd);

    expect(manifest).toContain('from "./v3-release-candidate-evidence"');
    expect(manifest).toContain("evaluateV3ReleaseCandidateEvidence");
    expect(manifest).toContain("verification: readonly V3CandidateVerificationEvidence[]");
    expect(manifest).toContain("workflowDecisions: readonly V3CandidateWorkflowDecisionEvidence[]");
    expect(applySignature).toContain("manifest: V3PromotionEvidenceManifest");
    expect(applySignature).not.toContain("releaseDecision");
    expect(applySignature).not.toContain("releaseEvidence:");
  });

  it("passes only the freshly evaluated release decision into #511", () => {
    const manifest = source();

    expect(manifest).toContain('from "./v3-promotion-observation-epoch"');
    expect(manifest).toContain("applyV3ObservedRolloutPromotion");
    expect(manifest).toContain("releaseEvidence: evaluated.releaseDecision");
    expect(manifest).toContain("releaseEvidenceRef: evaluated.manifestRef");
  });

  it("treats manifestRef as audit metadata rather than eligibility authority", () => {
    const manifest = source();

    expect(manifest).toContain("manifest reference is audit metadata only");
    expect(manifest).toContain("can never turn blocked evidence into a pass");
    expect(manifest).not.toContain("manifestRef ===");
    expect(manifest).not.toContain("manifestRef.includes");
  });

  it("requires manifest chronology after every component artifact", () => {
    const manifest = source();

    expect(manifest).toContain("assembledAt");
    expect(manifest).toContain("assembled before ${evidence.gate} verification evidence existed");
    expect(manifest).toContain("assembled before ${evidence.decision.workflow} workflow evidence existed");
    expect(manifest).toContain("assembled before its observability evidence existed");
    expect(manifest).toContain("cannot be assembled after promotion server time");
  });

  it("keeps promotion target immutable across manifest and requested transition", () => {
    const manifest = source();

    expect(manifest).toContain("targetForPromotion");
    expect(manifest).toContain("Promotion evidence manifest targets");
    expect(manifest).toContain('to === "retired" ? "retire_legacy" : to');
  });

  it("does not duplicate workflow, observability, ledger or epoch safety logic", () => {
    const manifest = source();

    expect(manifest).not.toContain("canonicalReadReady");
    expect(manifest).not.toContain("maxBootstrapFailureRate");
    expect(manifest).not.toContain("window_predates_stage_epoch");
    expect(manifest).not.toContain("input.current.revision + 1");
    expect(manifest).not.toContain("evaluateV3WorkflowCutover");
    expect(manifest).not.toContain("evaluateV3RolloutObservability");
  });

  it("cannot own persistence, network, browser state, polling or client time", () => {
    const manifest = source();

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
      expect(manifest).not.toContain(forbidden);
    }
  });
});
