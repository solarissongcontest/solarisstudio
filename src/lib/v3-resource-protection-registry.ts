export type V3ResourceProtectionState = "declared" | "verified";
export type V3ResourceProtectionKind =
  | "rate-limit"
  | "idempotency"
  | "batch-bound"
  | "retry-ceiling"
  | "resource-limit";

export type V3ResourceProtection = {
  id: string;
  kind: V3ResourceProtectionKind;
  state: V3ResourceProtectionState;
  surface: string;
  authority: "database" | "server" | "edge";
  externallyTriggerable: boolean;
  bounds: Readonly<Record<string, number | string | boolean>>;
  failureState: string;
  replaySafe: boolean;
  evidence: readonly string[];
};

/**
 * S8 inventory of limits we can prove from current server/database code.
 *
 * This registry deliberately records implemented bounds rather than inventing
 * product thresholds. A protection is `verified` only when the repository owns
 * both the enforcement point and regression evidence for the defect class.
 */
export const V3_RESOURCE_PROTECTION_REGISTRY: readonly V3ResourceProtection[] = [
  {
    id: "country-auth-fixed-window-limit",
    kind: "rate-limit",
    state: "verified",
    surface: "public country-account signup/signin/recovery edge flow",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      minLimit: 1,
      maxLimit: 1000,
      minWindowSeconds: 1,
      maxWindowSeconds: 86400,
      staleCounterRetentionDays: 2,
      cleanupBatchSize: 200,
    },
    failureState: "rate_limited",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261004224000_country_auth_rate_limits.sql",
      "src/lib/country-auth-rate-limit.contract.test.ts",
      ".github/scripts/rules-integrity-security-rehearsal.sh",
    ],
  },
  {
    id: "critical-operation-semantic-idempotency",
    kind: "idempotency",
    state: "verified",
    surface: "S2 consequential operation ledger",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      fingerprintAlgorithm: "sha256",
      actorScoped: true,
      commandScoped: true,
      semanticPayloadBound: true,
    },
    failureState: "IDEMPOTENCY_CONFLICT",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
      "src/lib/v3-system-operation-receipts.test.ts",
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
    ],
  },
  {
    id: "confirmation-draft-payload-budget",
    kind: "resource-limit",
    state: "verified",
    surface: "anonymous legacy + V3 Confirmation draft persistence",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      maxPayloadBytes: 32768,
      legacyRpcCovered: true,
      v3RpcCovered: true,
      directWriterConstraint: true,
    },
    failureState: "resource_limit",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261016063000_v3_s8_confirmation_resource_limits.sql",
      "src/lib/v3-s8-confirmation-resource-limits.contract.test.ts",
      ".github/scripts/v3-s8-confirmation-resource-limits-rehearsal.sh",
    ],
  },
  {
    id: "prediction-round-derived-item-budget",
    kind: "batch-bound",
    state: "verified",
    surface: "authenticated Prediction Arena submission",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      roundRowLocked: true,
      maxItemsDerivedFromPredictionTypes: true,
      participantCountBound: true,
      qualifierCountBound: true,
      duplicateTypeCountryRejected: true,
    },
    failureState: "invalid_prediction_payload",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
      "src/lib/v3-s8-prediction-replay-protection.test.ts",
      ".github/scripts/v3-s8-prediction-replay-protection-rehearsal.sh",
    ],
  },
  {
    id: "prediction-semantic-replay-noop",
    kind: "idempotency",
    state: "verified",
    surface: "authenticated Prediction Arena retry path",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      canonicalFieldSet: true,
      canonicalOrder: true,
      oneEntryPerRoundProfile: true,
      entryRowLocked: true,
      semanticRetryIsNoop: true,
    },
    failureState: "validation_error",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
      "src/lib/v3-s8-prediction-replay-protection.test.ts",
      ".github/scripts/v3-s8-prediction-replay-protection-rehearsal.sh",
    ],
  },
  {
    id: "domain-event-consumer-claim-batch",
    kind: "batch-bound",
    state: "verified",
    surface: "S4 transactional outbox consumer claims",
    authority: "database",
    externallyTriggerable: false,
    bounds: {
      minBatch: 1,
      maxBatch: 100,
      defaultBatch: 25,
      minLeaseSeconds: 5,
      maxLeaseSeconds: 3600,
      skipLocked: true,
      serviceRoleOnly: true,
    },
    failureState: "invalid_claim_parameters",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
      ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
    ],
  },
  {
    id: "domain-event-consumer-retry-ceiling",
    kind: "retry-ceiling",
    state: "verified",
    surface: "S4 transactional outbox failure/retry lifecycle",
    authority: "database",
    externallyTriggerable: false,
    bounds: {
      defaultMaxAttempts: 8,
      minMaxAttempts: 1,
      maxMaxAttempts: 100,
      minRetryAfterSeconds: 0,
      maxRetryAfterSeconds: 86400,
      maxErrorMetadataBytes: 8192,
      deadLetterAfterCeiling: true,
    },
    failureState: "dead_letter",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
      ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
    ],
  },
  {
    id: "public-image-finalization-limits",
    kind: "resource-limit",
    state: "verified",
    surface: "shared upload quarantine/finalization pipeline for public images",
    authority: "edge",
    externallyTriggerable: true,
    bounds: {
      maxBytes: 5 * 1024 * 1024,
      maxDimension: 8192,
      maxPixels: 40_000_000,
      thumbnailMaxEdge: 512,
      signatureValidation: true,
      metadataStripping: true,
    },
    failureState: "rejected",
    replaySafe: false,
    evidence: [
      "supabase/functions/solaris-upload-finalize/index.ts",
      "src/lib/organisation-v5-upload-safety.contract.test.ts",
    ],
  },
  {
    id: "custom-font-upload-preparation-budget",
    kind: "resource-limit",
    state: "verified",
    surface: "country custom-font upload authorization",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      maxBytes: 4 * 1024 * 1024,
      woff2Only: true,
      quarantineRequired: true,
    },
    failureState: "invalid_upload",
    replaySafe: false,
    evidence: [
      "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
      "src/lib/organisation-v5-upload-safety.contract.test.ts",
    ],
  },
  {
    id: "custom-font-finalization-decompression-budget",
    kind: "resource-limit",
    state: "verified",
    surface: "country custom-font server-side WOFF2 finalization",
    authority: "edge",
    externallyTriggerable: true,
    bounds: {
      maxDecompressedBytes: 16 * 1024 * 1024,
      maxSfntTables: 128,
      signatureValidation: true,
      normalizedRecompression: true,
    },
    failureState: "rejected",
    replaySafe: false,
    evidence: [
      "supabase/functions/solaris-upload-finalize/index.ts",
      "src/lib/organisation-v5-upload-safety.contract.test.ts",
    ],
  },
  {
    id: "integrity-evidence-upload-resource-budget",
    kind: "resource-limit",
    state: "verified",
    surface: "anonymous + authenticated integrity evidence upload preparation",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      maxBytes: 15 * 1024 * 1024,
      maxFilenameChars: 180,
      pdfAllowed: true,
      utf8TextAllowed: true,
      quarantineRequired: true,
    },
    failureState: "invalid_evidence_file",
    replaySafe: false,
    evidence: [
      "supabase/migrations/20260910213300_integrity_evidence_vault.sql",
      "supabase/migrations/20261003214000_organisation_os_v5_integrity_upload_quarantine.sql",
      "src/lib/organisation-v5-upload-safety.contract.test.ts",
    ],
  },
] as const;

export const V3_RESOURCE_PROTECTION_GAPS = [
  {
    id: "next-in-line-submit-protection",
    status: "audit-required" as const,
    reason: "side-participation submission needs canonical replay/rate/resource protection evidence",
  },
  {
    id: "organizer-bulk-mutation-bounds",
    status: "audit-required" as const,
    reason: "Organizer bulk operations require an explicit batch-size and concurrency audit",
  },
] as const;

export function v3ResourceProtection(id: string) {
  return V3_RESOURCE_PROTECTION_REGISTRY.find((item) => item.id === id) ?? null;
}

export function validateV3ResourceProtectionRegistry() {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const protection of V3_RESOURCE_PROTECTION_REGISTRY) {
    if (seen.has(protection.id)) errors.push(`duplicate protection ${protection.id}`);
    seen.add(protection.id);
    if (!protection.surface.trim()) errors.push(`${protection.id} has no protected surface`);
    if (!protection.failureState.trim()) errors.push(`${protection.id} has no failure state`);
    if (protection.state === "verified" && protection.evidence.length < 2) {
      errors.push(`${protection.id} claims verified protection without implementation + regression evidence`);
    }
    if (Object.keys(protection.bounds).length === 0) {
      errors.push(`${protection.id} has no explicit bound/invariant`);
    }
  }

  return errors;
}
