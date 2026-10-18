export const V3_FAILURE_INJECTION_SCENARIOS = [
  "transient_rpc_failure",
  "event_consumer_failure",
  "duplicate_delivery",
  "lost_response_after_commit",
  "stale_projection",
  "reconciliation_retry",
  "queue_backlog",
  "unavailable_dependency",
] as const;

export type V3FailureInjectionScenario = (typeof V3_FAILURE_INJECTION_SCENARIOS)[number];
export type V3FailureCoverageState = "rehearsed" | "partial" | "contract_only" | "missing";

export type V3FailureCoverageEntry = {
  scenario: V3FailureInjectionScenario;
  state: V3FailureCoverageState;
  injection: string;
  expectedRecovery: string;
  evidence: readonly string[];
  remainingGap: string | null;
  productionTrafficRequired: false;
};

/**
 * Reliability evidence inventory for the failure classes explicitly required by
 * the System V3 plan. This registry never upgrades a contract/test to
 * `rehearsed` unless a deterministic local rehearsal actually injects the
 * failure and verifies recovery or replay semantics.
 */
export const V3_FAILURE_INJECTION_COVERAGE: readonly V3FailureCoverageEntry[] = [
  {
    scenario: "transient_rpc_failure",
    state: "partial",
    injection: "Mark a canonical operation uncertain with TIMEOUT after claiming it.",
    expectedRecovery: "Reconcile the actor-owned operation receipt; retry only through canonical idempotency semantics.",
    evidence: [
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      "src/lib/v3-system-operation-receipts.test.ts",
    ],
    remainingGap:
      "The local rehearsal proves TIMEOUT uncertainty and operation reconciliation separately, but does not yet inject a transport failure around one real workflow RPC and prove the same committed operation is recovered end-to-end.",
    productionTrafficRequired: false,
  },
  {
    scenario: "event_consumer_failure",
    state: "rehearsed",
    injection: "Fail a claimed DomainEvent delivery through the canonical S4 failure RPC.",
    expectedRecovery: "Retry under the lease contract, dead-letter at the configured ceiling, then recover through explicit requeue.",
    evidence: [
      ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
    ],
    remainingGap: null,
    productionTrafficRequired: false,
  },
  {
    scenario: "duplicate_delivery",
    state: "rehearsed",
    injection: "Replay the same semantic event and repeat consumer completion.",
    expectedRecovery: "Reuse the immutable event/outbox state and converge on exactly one immutable consumer receipt.",
    evidence: [
      ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
    ],
    remainingGap: null,
    productionTrafficRequired: false,
  },
  {
    scenario: "lost_response_after_commit",
    state: "partial",
    injection: "Replay a normalized semantic operation after its original receipt has already committed successfully.",
    expectedRecovery: "Return the original operation id and committed result instead of executing the mutation again.",
    evidence: [
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      "src/lib/v3-system-operation-receipts.test.ts",
      "src/lib/v3-reliability-slo.ts",
    ],
    remainingGap:
      "Committed-operation replay is proven, but the rehearsal does not actually discard or interrupt a real workflow response after commit. A dedicated local transport-loss injection must prove that the client recovers the same durable receipt/result before this scenario can be marked rehearsed.",
    productionTrafficRequired: false,
  },
  {
    scenario: "stale_projection",
    state: "contract_only",
    injection: "Deliberately make a rebuildable derived projection stale while preserving canonical domain truth.",
    expectedRecovery: "Run only the bounded rebuild path declared by the S6 registry and verify against canonical sources.",
    evidence: [
      "src/lib/v3-projection-reconciliation-registry.ts",
      "src/lib/v3-recovery-guardrails.ts",
      "docs/runbooks/projection-outbox-recovery.md",
      "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
    ],
    remainingGap:
      "A dedicated local rehearsal still needs to corrupt/delete one derived Organizer Task projection, invoke the bounded edition rebuild, and prove exact convergence without mutating canonical workflow truth.",
    productionTrafficRequired: false,
  },
  {
    scenario: "reconciliation_retry",
    state: "partial",
    injection: "Retry reconciliation after an operation or derived-state recovery attempt is inconclusive.",
    expectedRecovery: "Idempotently converge through the existing operation receipt or bounded projection rebuild contract.",
    evidence: [
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      "src/lib/v3-recovery-guardrails.ts",
      "src/lib/v3-projection-reconciliation-registry.ts",
    ],
    remainingGap:
      "There is no isolated rehearsal that deliberately fails a projection rebuild/verification step and then proves a second reconciliation attempt converges without duplicate side effects.",
    productionTrafficRequired: false,
  },
  {
    scenario: "queue_backlog",
    state: "contract_only",
    injection: "Create a bounded DomainEvent/reconciliation backlog while retaining ordinary workload traffic.",
    expectedRecovery: "Drain through canonical bounded consumers/reconciliation while observing queue depth, retry pressure and normal-workload latency.",
    evidence: [
      "src/lib/v3-capacity-scenarios.ts",
      ".github/scripts/v3-s12-local-capacity-rehearsal.mjs",
      "src/lib/v3-capacity-evidence.ts",
    ],
    remainingGap:
      "The scenario and measurements exist, but representative reconciliation-backlog-drain evidence has not yet been executed and retained with an evidence-backed load shape.",
    productionTrafficRequired: false,
  },
  {
    scenario: "unavailable_dependency",
    state: "rehearsed",
    injection: "Record DEPENDENCY_FAILURE for a claimed event consumer delivery.",
    expectedRecovery: "Schedule retry, preserve attempt evidence, dead-letter repeated poison work, and requeue only through the explicit operator path.",
    evidence: [
      ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
      "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
    ],
    remainingGap: null,
    productionTrafficRequired: false,
  },
] as const;

export function validateV3FailureInjectionCoverage() {
  const errors: string[] = [];
  const expected = new Set<string>(V3_FAILURE_INJECTION_SCENARIOS);
  const seen = new Set<string>();

  for (const entry of V3_FAILURE_INJECTION_COVERAGE) {
    if (!expected.has(entry.scenario)) errors.push(`unknown failure scenario ${entry.scenario}`);
    if (seen.has(entry.scenario)) errors.push(`duplicate failure scenario ${entry.scenario}`);
    seen.add(entry.scenario);
    if (!entry.injection.trim()) errors.push(`${entry.scenario} has no injection description`);
    if (!entry.expectedRecovery.trim()) errors.push(`${entry.scenario} has no expected recovery`);
    if (entry.evidence.length === 0 && entry.state !== "missing") {
      errors.push(`${entry.scenario} claims ${entry.state} without evidence`);
    }
    if (entry.state === "rehearsed" && entry.remainingGap !== null) {
      errors.push(`${entry.scenario} is rehearsed but still declares a gap`);
    }
    if (entry.state !== "rehearsed" && !entry.remainingGap?.trim()) {
      errors.push(`${entry.scenario} is ${entry.state} without an explicit remaining gap`);
    }
    if (entry.productionTrafficRequired !== false) {
      errors.push(`${entry.scenario} incorrectly requires production traffic`);
    }
  }

  for (const scenario of expected) {
    if (!seen.has(scenario)) errors.push(`missing failure scenario ${scenario}`);
  }
  return errors;
}

export function buildV3FailureInjectionCoverageReport() {
  const counts: Record<V3FailureCoverageState, number> = {
    rehearsed: 0,
    partial: 0,
    contract_only: 0,
    missing: 0,
  };
  for (const entry of V3_FAILURE_INJECTION_COVERAGE) counts[entry.state] += 1;

  return {
    schemaVersion: 1 as const,
    counts,
    scenarios: V3_FAILURE_INJECTION_COVERAGE,
    unresolved: V3_FAILURE_INJECTION_COVERAGE
      .filter((entry) => entry.state !== "rehearsed")
      .map((entry) => ({
        scenario: entry.scenario,
        state: entry.state,
        remainingGap: entry.remainingGap,
      })),
    productionTrafficRequired: false as const,
    certificationClaim: false as const,
  };
}
