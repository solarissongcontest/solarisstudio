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
const prediction = source(
  "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
);
const nextInLine = source(
  "supabase/migrations/20261016150000_v3_s7_next_in_line_authorization.sql",
);
const organizerBulk = source(
  "supabase/migrations/20261016153000_v3_s8_identity_set_bulk_protection.sql",
);
const outbox = source("supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql");
const uploadAuthorization = source(
  "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
);
const evidenceVault = source("supabase/migrations/20260910213300_integrity_evidence_vault.sql");
const uploadFinalizer = source("supabase/functions/solaris-upload-finalize/index.ts");

describe("System V3 S8 resource protection registry", () => {
  it("keeps every verified control tied to implementation and regression evidence", () => {
    expect(validateV3ResourceProtectionRegistry()).toEqual([]);
    expect(V3_RESOURCE_PROTECTION_REGISTRY.length).toBeGreaterThan(0);
    expect(
      V3_RESOURCE_PROTECTION_REGISTRY.every(
        (item) => item.state !== "verified" || item.evidence.length >= 2,
      ),
    ).toBe(true);
  });

  it("records the actual bounded country-auth limiter", () => {
    expect(v3ResourceProtection("country-auth-fixed-window-limit")?.bounds).toMatchObject({
      minLimit: 1,
      maxLimit: 1000,
      minWindowSeconds: 1,
      maxWindowSeconds: 86400,
      cleanupBatchSize: 200,
    });
    expect(authLimiter).toContain("p_limit < 1 or p_limit > 1000");
    expect(authLimiter).toContain("p_window_seconds < 1 or p_window_seconds > 86400");
    expect(authLimiter).toContain("limit 200");
  });

  it("keeps consequential operation replay semantic and actor scoped", () => {
    expect(v3ResourceProtection("critical-operation-semantic-idempotency")).toMatchObject({
      kind: "idempotency",
      replaySafe: true,
      failureState: "IDEMPOTENCY_CONFLICT",
    });
    expect(operationLedger).toContain("private.studio2_request_fingerprint");
    expect(operationLedger).toContain("receipt.idempotency_key = v_key");
    expect(operationLedger).toContain("message = 'IDEMPOTENCY_CONFLICT'");
  });

  it("keeps Confirmation draft payloads bounded at RPC and table boundaries", () => {
    expect(v3ResourceProtection("confirmation-draft-payload-budget")?.bounds).toMatchObject({
      maxPayloadBytes: 32768,
      legacyRpcCovered: true,
      v3RpcCovered: true,
      directWriterConstraint: true,
    });
    expect(confirmationLimits).toContain("octet_length(p_payload::text) > 32768");
    expect(confirmationLimits).toContain("check (octet_length(payload::text) <= 32768) not valid");
  });

  it("records Prediction's configured item budget and semantic retry behavior", () => {
    expect(v3ResourceProtection("prediction-canonical-submit-protection")?.bounds).toMatchObject({
      configuredItemBudget: true,
      canonicalPayloadOrdering: true,
      oneRowPerRoundProfile: true,
      semanticReplayNoVersionAmplification: true,
      concurrentRetrySafe: true,
    });
    expect(prediction).toContain("jsonb_array_length");
    expect(prediction).toContain("prediction_entry_versions");
    expect(prediction).toContain("for update");
    expect(prediction).toContain("private.v3_prediction_payload_canonical(previous_payload)");
    expect(prediction).toContain("return entry_row.id;");
  });

  it("closes the Next in Line replay/resource gap at the authorization boundary", () => {
    expect(v3ResourceProtection("next-in-line-canonical-submit-protection")?.bounds).toMatchObject({
      oneRowPerEditionSource: true,
      maxCountryChars: 80,
      maxArtistChars: 160,
      maxSongChars: 160,
      maxUrlChars: 500,
      semanticIdempotency: true,
      directBrowserWritesRevoked: true,
      anonymousMutationRevoked: true,
    });
    expect(nextInLine).toContain("next_in_line_submissions_edition_source_v3_uidx");
    expect(nextInLine).toContain("private.studio2_claim_operation(");
    expect(nextInLine).toContain("revoke insert, update, delete on table public.next_in_line_submissions");
  });

  it("records Organizer identity-set bounds from the exact valid universes", () => {
    expect(v3ResourceProtection("organizer-identity-set-bulk-bounds")?.bounds).toMatchObject({
      communicationDestinationUniverse: 3,
      specificCountriesBoundByCanonicalUniverse: true,
      confirmationCountriesBoundByCanonicalUniverse: true,
      confirmationEditionSerialized: true,
    });
    expect(organizerBulk).toContain("cardinality(coalesce(p_display_surfaces, '{}'::text[])) > 3");
    expect(organizerBulk).toContain("select count(*)::integer into v_country_count from public.countries");
    expect(organizerBulk).toContain("studio2-confirmation-requirements:");
    expect(organizerBulk).toContain("pg_advisory_xact_lock");
  });

  it("bounds outbox claims and dead-letters bounded retries", () => {
    expect(v3ResourceProtection("domain-event-consumer-claim-batch")?.bounds).toMatchObject({
      minBatch: 1,
      maxBatch: 100,
      defaultBatch: 25,
      minLeaseSeconds: 5,
      maxLeaseSeconds: 3600,
      skipLocked: true,
    });
    expect(v3ResourceProtection("domain-event-consumer-retry-ceiling")?.bounds).toMatchObject({
      defaultMaxAttempts: 8,
      maxRetryAfterSeconds: 86400,
      deadLetterAfterCeiling: true,
    });
    expect(outbox).toContain("for update skip locked");
    expect(outbox).toContain("v_dead_letter := v_delivery.attempt_count >= p_max_attempts");
  });

  it("records image, WOFF2 and evidence ceilings already enforced by the upload pipeline", () => {
    expect(v3ResourceProtection("public-image-finalization-limits")?.bounds).toMatchObject({
      maxBytes: 5 * 1024 * 1024,
      maxDimension: 8192,
      maxPixels: 40_000_000,
    });
    expect(v3ResourceProtection("country-font-finalization-limits")?.bounds).toMatchObject({
      maxUploadBytes: 4 * 1024 * 1024,
      maxDecompressedBytes: 16 * 1024 * 1024,
      maxSfntTables: 128,
      woff2Only: true,
    });
    expect(v3ResourceProtection("integrity-evidence-upload-limits")?.bounds).toMatchObject({
      maxUploadBytes: 15 * 1024 * 1024,
      maxFilenameChars: 180,
      activePdfMarkersRejected: true,
    });

    expect(uploadAuthorization).toContain("p_size > 4194304");
    expect(uploadFinalizer).toContain("totalSfntSize > 16 * 1024 * 1024");
    expect(uploadFinalizer).toContain("numTables <= 0 || numTables > 128");
    expect(evidenceVault).toContain("_size > 15728640");
    expect(evidenceVault).toContain("char_length(_name) > 180");
    expect(uploadFinalizer).toContain('"/JavaScript"');
    expect(uploadFinalizer).toContain('"/EmbeddedFile"');
  });

  it("has no remaining explicit S8 resource-protection audit gaps", () => {
    expect(V3_RESOURCE_PROTECTION_GAPS).toEqual([]);
  });
});
