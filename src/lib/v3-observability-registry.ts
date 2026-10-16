export type V3ObservabilityState = "declared" | "foundation" | "verified";
export type V3ObservabilitySignalKind =
  | "operation"
  | "domain-event"
  | "consumer-delivery"
  | "reconciliation"
  | "notification"
  | "system-job";

export type V3ObservabilitySignal = {
  id: string;
  kind: V3ObservabilitySignalKind;
  state: V3ObservabilityState;
  source: string;
  identifiers: readonly string[];
  statusFields: readonly string[];
  privacyBoundary: string;
  organizerVisible: boolean;
  evidence: readonly string[];
};

/**
 * S9 inventory of operational signals Solaris can prove today.
 *
 * `verified` means the durable signal and its access/diagnostic contract exist.
 * `foundation` means the durable data exists but a complete privacy-safe
 * operational projection has not yet been demonstrated.
 */
export const V3_OBSERVABILITY_REGISTRY: readonly V3ObservabilitySignal[] = [
  {
    id: "system-operation-trace",
    kind: "operation",
    state: "foundation",
    source: "public.studio2_operation_receipts",
    identifiers: ["operation_id", "correlation_id", "command", "actor_id"],
    statusFields: ["status", "error_code", "created_at", "updated_at", "completed_at"],
    privacyBoundary:
      "raw semantic request is represented only by request_fingerprint; structured error metadata is size-bounded",
    organizerVisible: false,
    evidence: [
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
      "src/lib/v3-system-operation-receipts.test.ts",
    ],
  },
  {
    id: "domain-event-trace",
    kind: "domain-event",
    state: "foundation",
    source: "private.v3_domain_events",
    identifiers: [
      "id",
      "event_type",
      "aggregate_type",
      "aggregate_id",
      "aggregate_version",
      "operation_id",
      "correlation_id",
    ],
    statusFields: ["occurred_at", "schema_version"],
    privacyBoundary: "event table is private and browser roles have no direct access",
    organizerVisible: false,
    evidence: [
      "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
    ],
  },
  {
    id: "domain-event-consumer-delivery-trace",
    kind: "consumer-delivery",
    state: "foundation",
    source: "private.v3_domain_event_outbox + private.v3_domain_event_consumer_receipts",
    identifiers: ["event_id", "consumer_key", "lease_owner"],
    statusFields: [
      "status",
      "attempt_count",
      "available_at",
      "lease_expires_at",
      "last_error_code",
      "dead_lettered_at",
      "completed_at",
    ],
    privacyBoundary: "outbox/consumer receipts are private and service-role mutation is required",
    organizerVisible: false,
    evidence: [
      "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
      ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
    ],
  },
  {
    id: "operation-reconciliation-trace",
    kind: "reconciliation",
    state: "foundation",
    source: "public.studio2_reconcile_operation(operation_id)",
    identifiers: ["operationId", "correlationId"],
    statusFields: ["status", "result", "error"],
    privacyBoundary: "caller receives one exact operation reconciliation result, not a cross-user operation feed",
    organizerVisible: false,
    evidence: [
      "src/lib/system-operation-reconciliation.server.ts",
      "src/lib/system-operation-reconciliation.server.test.ts",
    ],
  },
  {
    id: "notification-runtime-health",
    kind: "notification",
    state: "verified",
    source: "public.admin_system_runtime_health(integer)",
    identifiers: ["delivery.id", "eventType", "category", "route"],
    statusFields: [
      "pending",
      "sent24h",
      "failed24h",
      "suppressed24h",
      "status",
      "scheduledFor",
      "sentAt",
      "openedAt",
    ],
    privacyBoundary:
      "diagnostic projection omits subscriptions/raw push content and truncates delivery errors before Organizer exposure",
    organizerVisible: true,
    evidence: [
      "supabase/migrations/20261002193000_organisation_os_v5_system_diagnostics.sql",
      "supabase/migrations/20261004222500_push_delivery_receipts.sql",
      "src/lib/push-delivery-receipts.contract.test.ts",
    ],
  },
  {
    id: "system-job-runtime-health",
    kind: "system-job",
    state: "verified",
    source: "public.admin_system_runtime_health(integer)",
    identifiers: ["jobId", "name"],
    statusFields: ["active", "lastStatus", "lastStartAt", "lastEndAt", "lastMessage"],
    privacyBoundary: "only solaris-* scheduler jobs are projected; return messages are truncated",
    organizerVisible: true,
    evidence: [
      "supabase/migrations/20261002193000_organisation_os_v5_system_diagnostics.sql",
      "supabase/migrations/20261003161000_organisation_os_v5_system_job_recovery.sql",
    ],
  },
] as const;

export const V3_OBSERVABILITY_GAPS = [
  {
    id: "operation-event-consumer-organizer-projection",
    state: "missing" as const,
    requirement:
      "privacy-safe System Operations projection must correlate operation -> DomainEvent -> consumer delivery/retry/dead-letter state",
  },
  {
    id: "deployment-version-binding",
    state: "missing" as const,
    requirement: "critical operation diagnostics need immutable deployment/candidate identity where the runtime can supply it",
  },
  {
    id: "projection-reconciliation-health",
    state: "missing" as const,
    requirement: "S6 rebuild/reconciliation runs need visible success/failure/freshness diagnostics",
  },
  {
    id: "measured-operational-counters",
    state: "missing" as const,
    requirement: "S10 baselines need real mutation success, consequence lag, retry/failure and projection-freshness measurements",
  },
] as const;

export function v3ObservabilitySignal(id: string) {
  return V3_OBSERVABILITY_REGISTRY.find((signal) => signal.id === id) ?? null;
}

export function validateV3ObservabilityRegistry() {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const signal of V3_OBSERVABILITY_REGISTRY) {
    if (seen.has(signal.id)) errors.push(`duplicate observability signal ${signal.id}`);
    seen.add(signal.id);
    if (!signal.source.trim()) errors.push(`${signal.id} has no source`);
    if (!signal.identifiers.length) errors.push(`${signal.id} has no trace identity`);
    if (!signal.statusFields.length) errors.push(`${signal.id} has no status fields`);
    if (!signal.privacyBoundary.trim()) errors.push(`${signal.id} has no privacy boundary`);
    if (signal.state === "verified" && signal.evidence.length < 2) {
      errors.push(`${signal.id} claims verified observability without enough evidence`);
    }
  }

  return errors;
}
