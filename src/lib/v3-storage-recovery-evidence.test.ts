import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assessV3StorageRecoveryEvidence } from "./v3-storage-recovery-evidence";

const SHA = "c24c9b6dabcea088f004eedcac3b42ad55074068";

type ObjectEvidence = {
  key: string;
  sha256: string;
  bytes: number;
  mimeType: string;
};

function object(key: string, mimeType: string, marker: string): ObjectEvidence {
  return {
    key,
    sha256: marker.repeat(64),
    bytes: 128,
    mimeType,
  };
}

function digest(objects: readonly ObjectEvidence[]) {
  const tsv = objects
    .map((value) => `${value.key}\t${value.sha256}\t${value.bytes}\t${value.mimeType}\n`)
    .join("");
  return createHash("sha256").update(tsv, "utf8").digest("hex");
}

function evidence(): Record<string, unknown> {
  const objects = [
    object("text/notice.txt", "text/plain", "a"),
    object("json/state.json", "application/json", "b"),
    object("binary/payload.bin", "application/octet-stream", "c"),
  ];
  return {
    schemaVersion: 1,
    kind: "storage_byte_recovery_rehearsal",
    scope: "isolated_local_supabase_storage",
    status: "passed",
    commitSha: SHA,
    environment: "isolated-local-supabase-storage",
    operatorIdentity: "chat-1-system",
    rehearsalId: "11111111-1111-4111-8111-111111111111",
    startedAt: "2026-10-21T00:00:00.000Z",
    completedAt: "2026-10-21T00:00:02.000Z",
    snapshot: {
      manifestSha256: digest(objects),
      objectCount: 3,
      objects,
      bucketPublic: false,
    },
    achieved: {
      exerciseRpoSeconds: 0,
      exerciseRtoMs: 2000,
      providerRpoClaim: false,
      providerRtoClaim: false,
    },
    validation: {
      sameBucketIdRestored: true,
      sameObjectKeysRestored: true,
      byteHashesVerified: true,
      byteSizesVerified: true,
      mimeTypesVerified: true,
      privatePolicyVerified: true,
      restoredCount: 3,
      missingCount: 0,
      extraCount: 0,
    },
    issuesFound: [],
    followUpActions: [
      "Validate hosted Supabase Storage backup/export source availability and provider restore behavior before final S11 certification.",
    ],
    certificationClaim: false,
    qaReviewRequired: true,
  };
}

describe("System V3 S11 Storage byte recovery evidence", () => {
  it("accepts complete isolated byte-recovery evidence for QA review", () => {
    const value = evidence();
    const manifestSha256 = (value.snapshot as Record<string, unknown>).manifestSha256;
    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment).toMatchObject({
      schemaVersion: 1,
      status: "ready_for_qa_review",
      expectedCommitSha: SHA,
      evidenceCommitSha: SHA,
      rehearsalId: "11111111-1111-4111-8111-111111111111",
      objectCount: 3,
      rehearsalDurationMs: 2000,
      exerciseRpoSeconds: 0,
      manifestSha256,
      errors: [],
      certificationClaim: false,
      qaReviewRequired: true,
    });
  });

  it("rejects mixed-SHA evidence", () => {
    const value = evidence();
    value.commitSha = "f".repeat(40);
    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "Storage recovery evidence does not belong to the expected commit SHA",
    );
  });

  it("requires exact object keys, MIME types and byte fingerprints", () => {
    const value = evidence();
    const snapshot = value.snapshot as Record<string, unknown>;
    snapshot.objects = [
      object("text/notice.txt", "application/json", "a"),
      object("json/state.json", "application/json", "b"),
      object("wrong/path.bin", "application/octet-stream", "not-a-hex-marker"),
    ];

    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("snapshot MIME type mismatch for text/notice.txt");
    expect(assessment.errors).toContain("snapshot contains unexpected object key wrong/path.bin");
    expect(assessment.errors).toContain(
      "snapshot is missing canonical rehearsal object binary/payload.bin",
    );
  });

  it("rejects manifest digests that no longer match retained object evidence", () => {
    const value = evidence();
    const snapshot = value.snapshot as Record<string, unknown>;
    const objects = snapshot.objects as ObjectEvidence[];
    objects[0] = { ...objects[0]!, bytes: 129 };

    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "manifestSha256 does not match the retained object manifest",
    );
  });

  it("rejects public-bucket or incomplete restore claims", () => {
    const value = evidence();
    const snapshot = value.snapshot as Record<string, unknown>;
    const validation = value.validation as Record<string, unknown>;
    snapshot.bucketPublic = true;
    validation.privatePolicyVerified = false;
    validation.restoredCount = 2;
    validation.missingCount = 1;
    validation.extraCount = 1;

    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("snapshot bucket must be private");
    expect(assessment.errors).toContain("privatePolicyVerified must be true");
    expect(assessment.errors).toContain("restoredCount must be 3");
    expect(assessment.errors).toContain("missingCount must be 0");
    expect(assessment.errors).toContain("extraCount must be 0");
  });

  it("rejects hosted/provider recovery claims from the local drill", () => {
    const value = evidence();
    value.achieved = {
      exerciseRpoSeconds: 0,
      exerciseRtoMs: 2000,
      providerRpoClaim: true,
      providerRtoClaim: true,
    };
    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "local Storage rehearsal must not claim provider RPO/RTO",
    );
  });

  it("rejects non-local scope, stale timing and nonzero exercise data loss", () => {
    const value = evidence();
    value.scope = "hosted_production_storage";
    value.startedAt = "2026-10-21T00:00:10.000Z";
    value.completedAt = "2026-10-21T00:00:01.000Z";
    value.achieved = {
      exerciseRpoSeconds: 30,
      exerciseRtoMs: 2000,
      providerRpoClaim: false,
      providerRtoClaim: false,
    };

    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("scope must be isolated_local_supabase_storage");
    expect(assessment.errors).toContain(
      "startedAt/completedAt must be ordered ISO timestamps",
    );
    expect(assessment.errors).toContain(
      "isolated Storage snapshot recovery must report exerciseRpoSeconds = 0",
    );
  });

  it("rejects a passed artifact that still reports recovery issues", () => {
    const value = evidence();
    value.issuesFound = ["restored object manifest diverged"];

    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "passed Storage recovery evidence must not contain issuesFound",
    );
  });

  it("never treats the component drill as S11 release certification", () => {
    const value = evidence();
    value.certificationClaim = true;
    value.qaReviewRequired = false;
    const assessment = assessV3StorageRecoveryEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "Storage recovery rehearsal must not claim release certification",
    );
    expect(assessment.errors).toContain("Storage recovery evidence must require QA review");
    expect(assessment.certificationClaim).toBe(false);
    expect(assessment.qaReviewRequired).toBe(true);
  });
});
