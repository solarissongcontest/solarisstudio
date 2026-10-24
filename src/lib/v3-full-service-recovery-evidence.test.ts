import { describe, expect, it } from "vitest";
import {
  V3_S11_FULL_SERVICE_CHECKS,
  assessV3FullServiceRecoveryEvidence,
  type V3S11FullServiceRecoveryManifest,
} from "./v3-full-service-recovery-evidence";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

type MutableManifestShape = {
  components: Array<Record<string, unknown>>;
  fullServiceRehearsal: Record<string, unknown>;
};

function completeManifest(): V3S11FullServiceRecoveryManifest {
  const components = ["database", "storage", "deployment"] as const;
  const checks = Object.fromEntries(
    V3_S11_FULL_SERVICE_CHECKS.map((check) => [check, true]),
  ) as Record<(typeof V3_S11_FULL_SERVICE_CHECKS)[number], boolean>;

  return {
    schemaVersion: 1,
    candidateSha: SHA,
    components: components.map((component) => ({
      component,
      commitSha: SHA,
      status: "ready_for_qa_review" as const,
      rehearsalId: `${component}-rehearsal`,
      observedAt: "2026-10-24T16:00:00.000Z",
      artifactPath: `docs/evidence/v3-s11/${component}.json`,
      artifactSha256: DIGEST,
      certificationClaim: false as const,
      qaReviewRequired: true as const,
    })),
    fullServiceRehearsal: {
      commitSha: SHA,
      rehearsalId: "full-service-rehearsal",
      environment: "isolated",
      startedAt: "2026-10-24T16:00:00.000Z",
      completedAt: "2026-10-24T16:20:00.000Z",
      observedRpoSeconds: 0,
      observedRtoSeconds: 1200,
      componentRehearsalIds: {
        database: "database-rehearsal",
        storage: "storage-rehearsal",
        deployment: "deployment-rehearsal",
      },
      checks,
      unresolvedIssues: [],
      productionTouched: false,
      productionSupabaseTraffic: false,
      destructiveProductionRestore: false,
      providerRpoClaim: false,
      providerRtoClaim: false,
      certificationClaim: false,
      qaReviewRequired: true,
    },
  };
}

function mutableManifest(): MutableManifestShape {
  return completeManifest() as unknown as MutableManifestShape;
}

describe("S11 full-service recovery evidence", () => {
  it("marks complete exact-SHA isolated evidence ready for QA without claiming certification", () => {
    expect(assessV3FullServiceRecoveryEvidence(completeManifest(), SHA)).toEqual({
      schemaVersion: 1,
      status: "ready_for_qa_review",
      expectedCommitSha: SHA,
      candidateSha: SHA,
      missingComponents: [],
      incompleteChecks: [],
      unresolvedIssues: [],
      errors: [],
      certificationClaim: false,
      qaReviewRequired: true,
    });
  });

  it("fails closed on mixed component SHA", () => {
    const manifest = completeManifest();
    manifest.components[1].commitSha = "c".repeat(40);

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "storage component commitSha does not match candidateSha",
    );
  });

  it("keeps missing component evidence visibly incomplete", () => {
    const manifest = completeManifest();
    manifest.components = manifest.components.filter(
      (component) => component.component !== "deployment",
    );

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("component_evidence_incomplete");
    expect(assessment.missingComponents).toEqual(["deployment"]);
  });

  it("does not accept an end-to-end rehearsal with an incomplete cross-layer check", () => {
    const manifest = completeManifest();
    manifest.fullServiceRehearsal.checks.publicationIntegrity = false;

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("rehearsal_incomplete");
    expect(assessment.incompleteChecks).toEqual(["publicationIntegrity"]);
  });

  it("does not accept unresolved recovery issues", () => {
    const manifest = completeManifest();
    manifest.fullServiceRehearsal.unresolvedIssues = [
      "Storage manifest differs from database references",
    ];

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("rehearsal_incomplete");
    expect(assessment.unresolvedIssues).toEqual([
      "Storage manifest differs from database references",
    ]);
  });

  it("rejects production-touching or provider-overclaiming rehearsal evidence", () => {
    const manifest = mutableManifest();
    manifest.fullServiceRehearsal.productionSupabaseTraffic = true;
    manifest.fullServiceRehearsal.providerRtoClaim = true;

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "full-service rehearsal productionSupabaseTraffic must be false",
    );
    expect(assessment.errors).toContain(
      "full-service rehearsal providerRtoClaim must be false",
    );
  });

  it("rejects a component assessment that tries to impersonate release certification", () => {
    const manifest = mutableManifest();
    manifest.components[0].certificationClaim = true;

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "database component must not claim release certification",
    );
  });

  it("binds the composed rehearsal to the exact component rehearsal identities", () => {
    const manifest = completeManifest();
    manifest.fullServiceRehearsal.componentRehearsalIds.storage = "other-storage-run";

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "full-service rehearsal storage identity does not match component evidence",
    );
  });

  it("rejects unsafe artifact paths and malformed digests", () => {
    const manifest = mutableManifest();
    manifest.components[0].artifactPath = "../../secret.json";
    manifest.components[1].artifactSha256 = "not-a-digest";

    const assessment = assessV3FullServiceRecoveryEvidence(manifest, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "database component artifactPath must be a safe relative path",
    );
    expect(assessment.errors).toContain(
      "storage component artifactSha256 must be a SHA-256 digest",
    );
  });
});
