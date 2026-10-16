import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_RESOURCE_PROTECTION_GAPS,
  V3_RESOURCE_PROTECTION_REGISTRY,
  v3ResourceProtection,
  validateV3ResourceProtectionRegistry,
} from "./v3-resource-protection-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const authLimiter = source("supabase/migrations/20261004224000_country_auth_rate_limits.sql");
const operationLedger = source(
  "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
);
const confirmationLimits = source(
  "supabase/migrations/20261016063000_v3_s8_confirmation_resource_limits.sql",
);
const predictionProtection = source(
  "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
);
const uploadQuarantine = source(
  "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
);
const integrityVault = source(
  "supabase/migrations/20260910213300_integrity_evidence_vault.sql",
);
const integrityQuarantine = source(
  "supabase/migrations/20261003214000_organisation_os_v5_integrity_upload_quarantine.sql",
);
const outbox = source("supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql");
const uploadFinalizer = source("supabase/functions/solaris-upload-finalize/index.ts");

describe("System V3 S8 resource protection registry", () => {
  it("keeps every claimed verified control tied to implementation and regression evidence", () => {
    expect(validateV3ResourceProtectionRegistry()).toEqual([]);
    expect(V3_RESOURCE_PROTECTION_REGISTRY.length).toBeGreaterThan(0);
    expect(
      V3_RESOURCE_PROTECTION_REGISTRY.every(
        (item) => item.state !== "verified" || item.evidence.length >= 2,
      ),
    ).toBe(true);
  });

  it("records the actual bounded country-auth limiter instead of inventing product limits", () => {
    const protection = v3ResourceProtection("country-auth-fixed-window-limit");
    expect(protection?.bounds).toMatchObject({
      minLimit: 1,
      maxLimit: 1000,
      minWindowSeconds: 1,
      maxWindowSeconds: 86400,
      staleCounterRetentionDays: 2,
      cleanupBatchSize: 200,
    });
    expect(authLimiter).toContain("p_limit < 1 or p_limit > 1000");
    expect(authLimiter).toContain("p_window_seconds < 1 or p_window_seconds > 86400");
    expect(authLimiter).toContain("limit 200");
    expect(authLimiter).toContain("interval '2 days'");
  });

  it("requires same-key semantic replay instead of duplicate critical operations", () => {
    const protection = v3ResourceProtection("critical-operation-semantic-idempotency");
    expect(protection).toMatchObject({
      kind: "idempotency",
      replaySafe: true,
      failureState: "IDEMPOTENCY_CONFLICT",
    });
    expect(operationLedger).toContain("private.studio2_request_fingerprint");
    expect(operationLedger).toContain("receipt.idempotency_key = v_key");
    expect(operationLedger).toContain("v_receipt.request_fingerprint is distinct from v_fingerprint");
    expect(operationLedger).toContain("message = 'IDEMPOTENCY_CONFLICT'");
  });

  it("records the evidence-based Confirmation draft payload ceiling at both RPC and table boundaries", () => {
    const protection = v3ResourceProtection("confirmation-draft-payload-budget");
    expect(protection).toMatchObject({
      kind: "resource-limit",
      authority: "database",
      externallyTriggerable: true,
      replaySafe: true,
      bounds: {
        maxPayloadBytes: 32768,
        legacyRpcCovered: true,
        v3RpcCovered: true,
        directWriterConstraint: true,
      },
    });
    expect(confirmationLimits).toContain("octet_length(p_payload::text) > 32768");
    expect(confirmationLimits).toContain("check (octet_length(payload::text) <= 32768) not valid");
    expect(
      confirmationLimits.match(/perform private\.v3_assert_confirmation_draft_resource_budget\(_payload\);/g)
        ?.length,
    ).toBe(2);
  });

  it("records the round-derived Prediction item budget", () => {
    const protection = v3ResourceProtection("prediction-round-derived-item-budget");
    expect(protection).toMatchObject({
      kind: "batch-bound",
      authority: "database",
      externallyTriggerable: true,
      replaySafe: true,
      bounds: {
        roundRowLocked: true,
        maxItemsDerivedFromPredictionTypes: true,
        participantCountBound: true,
        qualifierCountBound: true,
      },
    });
    expect(predictionProtection).toContain("for update");
    expect(predictionProtection).toContain("max_item_count :=");
    expect(predictionProtection).toContain("jsonb_array_length(_payload) > max_item_count");
    expect(predictionProtection).toContain("Prediction payload exceeds the configured round item budget");
  });

  it("records semantic Prediction replay as a concurrency-safe no-op", () => {
    const protection = v3ResourceProtection("prediction-semantic-replay-noop");
    expect(protection).toMatchObject({
      kind: "idempotency",
      authority: "database",
      replaySafe: true,
      bounds: {
        canonicalFieldSet: true,
        canonicalOrder: true,
        oneEntryPerRoundProfile: true,
        entryRowLocked: true,
        semanticRetryIsNoop: true,
      },
    });
    expect(predictionProtection).toContain("private.v3_prediction_payload_canonical");
    expect(predictionProtection).toContain("previous_payload");
    expect(predictionProtection).toContain("= private.v3_prediction_payload_canonical(_payload)");
    expect(predictionProtection).toContain("return entry_row.id");
  });

  it("bounds consumer batch/lease size and uses skip-locked concurrent claims", () => {
    expect(v3ResourceProtection("domain-event-consumer-claim-batch")?.bounds).toMatchObject({
      minBatch: 1,
      maxBatch: 100,
      defaultBatch: 25,
      minLeaseSeconds: 5,
      maxLeaseSeconds: 3600,
      skipLocked: true,
      serviceRoleOnly: true,
    });
    expect(outbox).toContain("p_limit integer default 25");
    expect(outbox).toContain("p_limit not between 1 and 100");
    expect(outbox).toContain("p_lease_seconds not between 5 and 3600");
    expect(outbox).toContain("for update skip locked");
  });

  it("dead-letters bounded retries instead of retrying forever", () => {
    expect(v3ResourceProtection("domain-event-consumer-retry-ceiling")?.bounds).toMatchObject({
      defaultMaxAttempts: 8,
      minMaxAttempts: 1,
      maxMaxAttempts: 100,
      maxRetryAfterSeconds: 86400,
      deadLetterAfterCeiling: true,
    });
    expect(outbox).toContain("p_max_attempts integer default 8");
    expect(outbox).toContain("p_max_attempts not between 1 and 100");
    expect(outbox).toContain("v_dead_letter := v_delivery.attempt_count >= p_max_attempts");
    expect(outbox).toContain("'dead_letter'");
  });

  it("records real public-image byte, dimension and pixel ceilings", () => {
    expect(v3ResourceProtection("public-image-finalization-limits")?.bounds).toMatchObject({
      maxBytes: 5 * 1024 * 1024,
      maxDimension: 8192,
      maxPixels: 40_000_000,
      thumbnailMaxEdge: 512,
    });
    expect(uploadFinalizer).toContain("const MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024");
    expect(uploadFinalizer).toContain("const MAX_PUBLIC_IMAGE_DIMENSION = 8192");
    expect(uploadFinalizer).toContain("const MAX_PUBLIC_IMAGE_PIXELS = 40_000_000");
    expect(uploadFinalizer).toContain("const THUMBNAIL_MAX_EDGE = 512");
  });

  it("records the existing custom-font preparation byte/type budget at the database boundary", () => {
    expect(v3ResourceProtection("custom-font-upload-preparation-budget")).toMatchObject({
      authority: "database",
      bounds: {
        maxBytes: 4 * 1024 * 1024,
        woff2Only: true,
        quarantineRequired: true,
      },
    });
    expect(uploadQuarantine).toContain("p_size > 4194304");
    expect(uploadQuarantine).toContain("v_mime <> 'font/woff2'");
    expect(uploadQuarantine).toContain("v_final_bucket := 'country-fonts'");
    expect(uploadQuarantine).toContain("'solaris-upload-quarantine'");
  });

  it("records WOFF2 decompression/table ceilings at the Edge finalizer boundary", () => {
    expect(v3ResourceProtection("custom-font-finalization-decompression-budget")).toMatchObject({
      authority: "edge",
      bounds: {
        maxDecompressedBytes: 16 * 1024 * 1024,
        maxSfntTables: 128,
        signatureValidation: true,
        normalizedRecompression: true,
      },
    });
    expect(uploadFinalizer).toContain("totalSfntSize > 16 * 1024 * 1024");
    expect(uploadFinalizer).toContain("numTables > 128");
    expect(uploadFinalizer).toContain("decompressed.length !== totalSfntSize");
    expect(uploadFinalizer).toContain("woff2.compress(decompressed)");
  });

  it("records the existing integrity-evidence byte/name budget", () => {
    expect(v3ResourceProtection("integrity-evidence-upload-resource-budget")?.bounds).toMatchObject({
      maxBytes: 15 * 1024 * 1024,
      maxFilenameChars: 180,
      pdfAllowed: true,
      utf8TextAllowed: true,
      quarantineRequired: true,
    });
    expect(integrityVault).toContain("char_length(_name) > 180");
    expect(integrityVault).toContain("_size > 15728640");
    expect(integrityVault).toContain("'application/pdf','text/plain'");
    expect(integrityQuarantine).toContain("studio2_create_evidence_upload_authorization");
    expect(integrityQuarantine).toContain("'solaris-upload-quarantine'");
    expect(integrityQuarantine).toContain("'integrity-evidence'");
  });

  it("keeps only genuinely unmerged S8 externally-triggerable gaps open", () => {
    expect(V3_RESOURCE_PROTECTION_GAPS.map((gap) => gap.id)).toEqual([
      "next-in-line-submit-protection",
      "organizer-bulk-mutation-bounds",
    ]);
    expect(V3_RESOURCE_PROTECTION_GAPS.map((gap) => gap.id)).not.toContain(
      "prediction-submit-protection",
    );
    expect(V3_RESOURCE_PROTECTION_GAPS.map((gap) => gap.id)).not.toContain(
      "non-image-upload-resource-bounds",
    );
    expect(V3_RESOURCE_PROTECTION_GAPS.every((gap) => gap.status === "audit-required")).toBe(true);
  });
});
