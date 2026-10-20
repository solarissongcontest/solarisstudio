import { describe, expect, it } from "vitest";
import { assessV3DatabaseRestoreEvidence } from "./v3-database-restore-evidence";

const SHA = "c24c9b6dabcea088f004eedcac3b42ad55074068";
const CRITICAL_RELATIONS = [
  "public.editions",
  "public.shows",
  "public.participants",
  "public.entries",
  "public.jury_votes",
  "public.televote_votes",
  "public.results",
  "public.studio2_operation_receipts",
  "public.admin_audit_log",
];

function evidence(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: "database_restore_rehearsal",
    scope: "isolated_local_supabase",
    status: "passed",
    commitSha: SHA,
    environment: "isolated-local-supabase",
    operatorIdentity: "chat-1-system",
    rehearsalId: "11111111-1111-4111-8111-111111111111",
    startedAt: "2026-10-21T00:00:00.000Z",
    completedAt: "2026-10-21T00:00:12.500Z",
    migrationHead: "20261019111000",
    snapshot: {
      format: "pg_dump_custom",
      sha256: "a".repeat(64),
      bytes: 4096,
    },
    achieved: {
      exerciseRpoSeconds: 0,
      exerciseRtoMs: 12500,
      providerRpoClaim: false,
      providerRtoClaim: false,
    },
    validation: {
      sentinelVerified: true,
      migrationHeadVerified: true,
      criticalRelationFingerprints: Object.fromEntries(
        CRITICAL_RELATIONS.map((relation, index) => [relation, `${index + 1}:${1000 + index}`]),
      ),
      foreignKeyValidationState: "42:42",
      operationReceiptsPresent: true,
      domainEventsPresent: true,
      domainEventOutboxPresent: true,
    },
    issuesFound: [],
    followUpActions: [
      "Validate hosted/provider backup and restore capability separately before final S11 certification.",
    ],
    certificationClaim: false,
    qaReviewRequired: true,
  };
}

describe("System V3 S11 database restore evidence", () => {
  it("accepts complete exact-SHA isolated restore evidence for QA review", () => {
    const assessment = assessV3DatabaseRestoreEvidence(evidence(), SHA);
    expect(assessment).toMatchObject({
      schemaVersion: 1,
      status: "ready_for_qa_review",
      expectedCommitSha: SHA,
      evidenceCommitSha: SHA,
      rehearsalId: "11111111-1111-4111-8111-111111111111",
      migrationHead: "20261019111000",
      rehearsalDurationMs: 12500,
      exerciseRpoSeconds: 0,
      snapshotSha256: "a".repeat(64),
      criticalRelationCount: CRITICAL_RELATIONS.length,
      errors: [],
      certificationClaim: false,
      qaReviewRequired: true,
    });
  });

  it("rejects evidence from another commit", () => {
    const value = evidence();
    value.commitSha = "b".repeat(40);
    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "database restore evidence does not belong to the expected commit SHA",
    );
  });

  it("requires traceable rehearsal, operator and migration-head identity", () => {
    const value = evidence();
    value.rehearsalId = "not-a-uuid";
    value.operatorIdentity = "";
    value.migrationHead = "latest";
    const validation = value.validation as Record<string, unknown>;
    validation.migrationHeadVerified = false;

    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("rehearsalId must be a UUID");
    expect(assessment.errors).toContain("operatorIdentity must be a 1..120 character label");
    expect(assessment.errors).toContain("migrationHead must be a migration version identifier");
    expect(assessment.errors).toContain("migrationHeadVerified must be true");
  });

  it("rejects hosted/provider RPO or RTO claims from the local exercise", () => {
    const value = evidence();
    value.achieved = {
      exerciseRpoSeconds: 0,
      exerciseRtoMs: 12500,
      providerRpoClaim: true,
      providerRtoClaim: true,
    };
    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("local rehearsal must not claim provider RPO/RTO");
  });

  it("requires every canonical critical relation fingerprint", () => {
    const value = evidence();
    const validation = value.validation as Record<string, unknown>;
    const fingerprints = {
      ...(validation.criticalRelationFingerprints as Record<string, string>),
    };
    delete fingerprints["public.jury_votes"];
    validation.criticalRelationFingerprints = fingerprints;

    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("missing or invalid fingerprint for public.jury_votes");
  });

  it("rejects unexpected relations so the retained verification set cannot silently drift", () => {
    const value = evidence();
    const validation = value.validation as Record<string, unknown>;
    validation.criticalRelationFingerprints = {
      ...(validation.criticalRelationFingerprints as Record<string, string>),
      "public.some_unreviewed_table": "1:1",
    };

    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "criticalRelationFingerprints contains an unexpected relation",
    );
  });

  it("rejects non-local scope, reversed timestamps and nonzero exercise RPO", () => {
    const value = evidence();
    value.scope = "production_supabase";
    value.startedAt = "2026-10-21T00:00:20.000Z";
    value.completedAt = "2026-10-21T00:00:10.000Z";
    value.achieved = {
      exerciseRpoSeconds: 60,
      exerciseRtoMs: 1000,
      providerRpoClaim: false,
      providerRtoClaim: false,
    };

    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain("scope must be isolated_local_supabase");
    expect(assessment.errors).toContain(
      "startedAt/completedAt must be ordered ISO timestamps",
    );
    expect(assessment.errors).toContain(
      "isolated snapshot restore evidence must report exerciseRpoSeconds = 0",
    );
  });

  it("never accepts a release-certification claim from this component rehearsal", () => {
    const value = evidence();
    value.certificationClaim = true;
    value.qaReviewRequired = false;

    const assessment = assessV3DatabaseRestoreEvidence(value, SHA);
    expect(assessment.status).toBe("invalid");
    expect(assessment.errors).toContain(
      "database restore rehearsal must not claim release certification",
    );
    expect(assessment.errors).toContain("database restore evidence must require QA review");
    expect(assessment.certificationClaim).toBe(false);
    expect(assessment.qaReviewRequired).toBe(true);
  });
});
