import { describe, expect, it } from "vitest";
import { assessV3DeploymentRollbackEvidence } from "./v3-deployment-rollback-evidence";

const SHA = "8288d577cf66622718206785ea7b912b220acc46";
const BASELINE_VERSION = "11111111-1111-4111-8111-111111111111";
const DEFECTIVE_VERSION = "22222222-2222-4222-8222-222222222222";

function evidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "cloudflare_deployment_rollback_rehearsal",
    scope: "isolated_cloudflare_worker",
    status: "passed",
    commitSha: SHA,
    environment: "isolated-cloudflare-worker",
    operatorIdentity: "chat-system-s11",
    rehearsalId: "33333333-3333-4333-8333-333333333333",
    startedAt: "2026-10-23T21:00:00.000Z",
    completedAt: "2026-10-23T21:00:14.000Z",
    wranglerVersion: "4.141.0",
    worker: {
      name: "solaris-s11-rollback-drill",
      productionWorkerName: "studio",
      targetUrl: "https://solaris-s11-rollback-drill.example.workers.dev/",
      fixtureBindings: "CF_VERSION_METADATA only",
    },
    versions: {
      baseline: {
        id: BASELINE_VERSION,
        marker: "known-good",
      },
      defective: {
        id: DEFECTIVE_VERSION,
        marker: "defective",
      },
      rolledBackToVersionId: BASELINE_VERSION,
    },
    achieved: {
      isolatedProviderRollbackMs: 4200,
      productionRpoClaim: false,
      productionRtoClaim: false,
      dataRollbackClaim: false,
    },
    validation: {
      baselineServedBeforeDefect: true,
      defectiveServedBeforeRollback: true,
      rollbackDeploymentSingleVersion: true,
      rollbackTrafficPercent: 100,
      runtimeVersionMatchesBaseline: true,
      runtimeMarkerMatchesBaseline: true,
      fixtureContainsNoSolarisBindings: true,
      databaseRollbackAttempted: false,
      storageRollbackAttempted: false,
    },
    artifactDigests: {
      baselineDeploy: "a".repeat(64),
      defectiveUpload: "b".repeat(64),
      defectiveDeploy: "c".repeat(64),
      preRollbackDeployments: "d".repeat(64),
      rollbackCommandOutput: "e".repeat(64),
      postRollbackDeployments: "f".repeat(64),
    },
    issuesFound: [],
    followUpActions: [
      "Compose database + Storage + deployment evidence in the separate full-service recovery drill.",
    ],
    certificationClaim: false,
    fullServiceRecoveryClaim: false,
    qaReviewRequired: true,
  };
}

describe("System V3 S11 deployment rollback evidence", () => {
  it("accepts complete exact-SHA isolated Cloudflare rollback evidence for QA review", () => {
    expect(assessV3DeploymentRollbackEvidence(evidence(), SHA)).toMatchObject({
      schemaVersion: 1,
      status: "ready_for_qa_review",
      expectedCommitSha: SHA,
      evidenceCommitSha: SHA,
      rehearsalId: "33333333-3333-4333-8333-333333333333",
      workerName: "solaris-s11-rollback-drill",
      baselineVersionId: BASELINE_VERSION,
      defectiveVersionId: DEFECTIVE_VERSION,
      isolatedProviderRollbackMs: 4200,
      errors: [],
      certificationClaim: false,
      fullServiceRecoveryClaim: false,
      qaReviewRequired: true,
    });
  });

  it("rejects evidence from a different candidate SHA", () => {
    const value = evidence();
    value.commitSha = "a".repeat(40);
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain(
      "deployment rollback evidence does not belong to the expected commit SHA",
    );
  });

  it("requires a dedicated workers.dev fixture rather than the production Worker", () => {
    const value = evidence();
    value.worker = {
      name: "studio",
      productionWorkerName: "studio",
      targetUrl: "https://studio.example.workers.dev/",
      fixtureBindings: "CF_VERSION_METADATA only",
    };
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain(
      "worker name must be a bounded solaris-s11-rollback-* test Worker",
    );

    const wrongUrl = evidence();
    (wrongUrl.worker as Record<string, unknown>).targetUrl = "https://studio.solaris.example/";
    const wrongUrlResult = assessV3DeploymentRollbackEvidence(wrongUrl, SHA);
    expect(wrongUrlResult.status).toBe("invalid");
    expect(wrongUrlResult.errors).toContain(
      "targetUrl must be an HTTPS workers.dev URL for the isolated Worker",
    );
  });

  it("requires distinct immutable versions and rollback to the known-good version", () => {
    const value = evidence();
    const versions = value.versions as Record<string, unknown>;
    versions.defective = { id: BASELINE_VERSION, marker: "defective" };
    versions.rolledBackToVersionId = DEFECTIVE_VERSION;
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("baseline and defective Worker versions must be distinct");
    expect(result.errors).toContain(
      "rolledBackToVersionId must equal the known-good baseline version",
    );
  });

  it("requires 100% single-version rollback plus runtime identity convergence", () => {
    const value = evidence();
    value.validation = {
      ...(value.validation as Record<string, unknown>),
      rollbackDeploymentSingleVersion: false,
      rollbackTrafficPercent: 50,
      runtimeVersionMatchesBaseline: false,
      runtimeMarkerMatchesBaseline: false,
    };
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain("rollbackDeploymentSingleVersion must be true");
    expect(result.errors).toContain("rollbackTrafficPercent must be exactly 100");
    expect(result.errors).toContain("runtimeVersionMatchesBaseline must be true");
    expect(result.errors).toContain("runtimeMarkerMatchesBaseline must be true");
  });

  it("rejects hidden data-recovery or production RTO/RPO claims", () => {
    const value = evidence();
    value.achieved = {
      isolatedProviderRollbackMs: 4200,
      productionRpoClaim: true,
      productionRtoClaim: true,
      dataRollbackClaim: true,
    };
    const validation = value.validation as Record<string, unknown>;
    validation.databaseRollbackAttempted = true;
    validation.storageRollbackAttempted = true;
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain(
      "isolated rollback rehearsal must not claim production RPO/RTO",
    );
    expect(result.errors).toContain(
      "application rollback must not claim database or Storage rollback",
    );
    expect(result.errors).toContain("databaseRollbackAttempted must be false");
    expect(result.errors).toContain("storageRollbackAttempted must be false");
  });

  it("fails closed when retained provider artifacts are missing or drifted", () => {
    const value = evidence();
    const digests = value.artifactDigests as Record<string, unknown>;
    delete digests.postRollbackDeployments;
    digests.unreviewed = "0".repeat(64);
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain(
      "artifactDigests.postRollbackDeployments must be a SHA-256 digest",
    );
    expect(result.errors).toContain("artifactDigests contains an unexpected artifact");
  });

  it("never turns the component drill into full-service or release certification", () => {
    const value = evidence();
    value.certificationClaim = true;
    value.fullServiceRecoveryClaim = true;
    value.qaReviewRequired = false;
    const result = assessV3DeploymentRollbackEvidence(value, SHA);
    expect(result.status).toBe("invalid");
    expect(result.errors).toContain(
      "deployment rollback component must not claim release certification",
    );
    expect(result.errors).toContain(
      "deployment rollback component must not claim full-service recovery",
    );
    expect(result.errors).toContain("deployment rollback evidence must require QA review");
    expect(result.certificationClaim).toBe(false);
    expect(result.fullServiceRecoveryClaim).toBe(false);
    expect(result.qaReviewRequired).toBe(true);
  });
});
