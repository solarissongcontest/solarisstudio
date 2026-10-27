export const V3_CONSEQUENCE_RELEASE_CLASSES = [
  "integrity_critical",
  "delivery_critical",
  "derived",
  "observational_or_pure_read",
] as const;

export type V3ConsequenceReleaseClass = (typeof V3_CONSEQUENCE_RELEASE_CLASSES)[number];

const PURE_READ_EVENTS = new Set([
  "activity.projected",
  "receipt.reconciled",
]);

const DELIVERY_PREFIXES = [
  "notification.",
  "notice.",
] as const;

const INTEGRITY_PREFIXES = [
  "confirmation.",
  "entry.",
  "media.",
  "jury.",
  "televote.",
  "results.",
  "result.",
  "publication.",
  "permissions.",
  "permission.",
  "account.",
  "membership.",
  "session.",
  "identity.",
  "edition.",
  "show.",
  "integrity.",
] as const;

/**
 * Release maturity follows consequence semantics, not a cosmetically uniform
 * matrix. Unknown events deliberately fall into `derived`, which is visible
 * debt but cannot silently gain integrity-grade release authority.
 */
export function classifyV3ConsequenceRelease(eventType: string): V3ConsequenceReleaseClass {
  if (PURE_READ_EVENTS.has(eventType)) return "observational_or_pure_read";
  if (DELIVERY_PREFIXES.some((prefix) => eventType.startsWith(prefix))) return "delivery_critical";
  if (INTEGRITY_PREFIXES.some((prefix) => eventType.startsWith(prefix))) return "integrity_critical";
  return "derived";
}

export function requiredConsequenceMaturity(releaseClass: V3ConsequenceReleaseClass) {
  switch (releaseClass) {
    case "integrity_critical":
      return [
        "declared",
        "emitted",
        "persisted",
        "outbox_when_async",
        "consumed",
        "idempotent",
        "reconciled",
        "observable",
        "required_projection_effects",
      ] as const;
    case "delivery_critical":
      return [
        "durable_enqueue_or_outbox",
        "retry_safe_consumption",
        "failure_visibility",
        "recovery_or_dead_letter_when_applicable",
      ] as const;
    case "derived":
      return [
        "canonical_source",
        "rebuildable_or_recoverable_when_needed",
        "cannot_corrupt_official_state",
        "operational_failure_visibility_when_important",
      ] as const;
    case "observational_or_pure_read":
      return ["canonical_source", "no_mutation_authority"] as const;
  }
}
