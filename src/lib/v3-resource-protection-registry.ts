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
    id: "prediction-canonical-submit-protection",
    kind: "resource-limit",
    state: "verified",
    surface: "Prediction round/profile submission and immutable version history",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      configuredItemBudget: true,
      canonicalPayloadOrdering: true,
      oneRowPerRoundProfile: true,
      semanticReplayNoVersionAmplification: true,
      concurrentRetrySafe: true,
    },
    failureState: "VALIDATION",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261016160000_v3_s8_prediction_replay_protection.sql",
      "src/lib/v3-s8-prediction-replay-protection.test.ts",
      ".github/scripts/v3-s8-prediction-replay-protection-rehearsal.sh",
    ],
  },
  {
    id: "next-in-line-canonical-submit-protection",
    kind: "resource-limit",
    state: "verified",
    surface: "authenticated participant Next in Line submission + reconciliation",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      oneRowPerEditionSource: true,
      maxCountryChars: 80,
      maxArtistChars: 160,
      maxSongChars: 160,
      maxUrlChars: 500,
      maxPreviewTokenChars: 10,
      semanticIdempotency: true,
      directBrowserWritesRevoked: true,
      anonymousMutationRevoked: true,
    },
    failureState: "VALIDATION",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261016150000_v3_s7_next_in_line_authorization.sql",
      "src/lib/v3-s7-next-in-line-authorization.contract.test.ts",
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
    ],
  },
  {
    id: "organizer-identity-set-bulk-bounds",
    kind: "batch-bound",
    state: "verified",
    surface: "Organizer Confirmation requirement and official-notice identity-set waves",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      communicationDestinationUniverse: 3,
      specificCountriesBoundByCanonicalUniverse: true,
      confirmationCountriesBoundByCanonicalUniverse: true,
      confirmationEditionSerialized: true,
    },
    failureState: "VALIDATION",
    replaySafe: true,
    evidence: [
      "supabase/migrations/20261016153000_v3_s8_identity_set_bulk_protection.sql",
      "src/lib/v3-s8-identity-set-bulk-protection.test.ts",
      ".github/scripts/v3-s8-identity-set-bulk-protection-rehearsal.sh",
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
    id: "country-font-finalization-limits",
    kind: "resource-limit",
    state: "verified",
    surface: "country custom-font authorization, quarantine and WOFF2 finalization",
    authority: "edge",
    externallyTriggerable: true,
    bounds: {
      maxUploadBytes: 4 * 1024 * 1024,
      maxDecompressedBytes: 16 * 1024 * 1024,
      maxSfntTables: 128,
      woff2Only: true,
      signatureValidation: true,
    },
    failureState: "rejected",
    replaySafe: false,
    evidence: [
      "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
      "supabase/functions/solaris-upload-finalize/index.ts",
      "src/lib/organisation-v5-upload-safety.contract.test.ts",
    ],
  },
  {
    id: "integrity-evidence-upload-limits",
    kind: "resource-limit",
    state: "verified",
    surface: "Integrity evidence authorization, quarantine and finalization",
    authority: "database",
    externallyTriggerable: true,
    bounds: {
      maxUploadBytes: 15 * 1024 * 1024,
      maxFilenameChars: 180,
      signatureValidation: true,
      activePdfMarkersRejected: true,
      quarantineByteCeilingMatchesEvidenceCeiling: true,
    },
    failureState: "rejected",
    replaySafe: false,
    evidence: [
      "supabase/migrations/20260910213300_integrity_evidence_vault.sql",
      "supabase/migrations/20261003214000_organisation_os_v5_integrity_upload_quarantine.sql",
      "supabase/functions/solaris-upload-finalize/index.ts",
      "src/lib/organisation-v5-upload-safety.contract.test.ts",
    ],
  },
] as const;

// Every explicit S8 protection gap from the canonical audit is now backed by
// an implemented server/database boundary plus regression evidence.
export const V3_RESOURCE_PROTECTION_GAPS = [] as const;

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
