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
export type V3FailureCoverageState =
  | "rehearsed"
  | "rehearsal_ready"
  | "partial"
  | "contract_only"
  | "missing";

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
 * the System V3 plan.
 *
 * `rehearsed` requires retained evidence that the deterministic local rehearsal
 * actually ran. `rehearsal_ready` means an executable local injection/recovery
 * path and source-level regression proof exist, but Chat 5 still needs to run
 * and retain exact-SHA rehearsal evidence before it may be promoted.
 */
export const V3_FAILURE_INJECTION_COVERAGE: readonly V3FailureCoverageEntry[] = [
  {
    scenario: "transient_rpc_failure",
    state: "rehearsal_ready",
    injection: "Forward a real governed R2 Jury-window RPC through a loopback proxy, fully consume the successful upstream response, then destroy the client socket so the caller observes a transport failure.",
    expectedRecovery: "Verify the durable succeeded receipt and canonical mutation, then retry the exact semantic operation through the canonical idempotency contract without re-execution.",
    evidence: [
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      ".github/scripts/v3-s11-lost-response-rehearsal.sh",
      "scripts/v3-drop-upstream-response-proxy.mjs",
      "src/lib/v3-s11-lost-response-rehearsal.test.ts",
    ],
    remainingGap:
      "The deterministic real-RPC transport-loss rehearsal is implemented, but exact-SHA local execution evidence still needs to be retained by the QA/release evidence lane.",
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
    state: "rehearsal_ready",
    injection: "Execute a real governed R2 Jury-window mutation through a loopback proxy that fully consumes the upstream 200 response but forwards no response bytes to the client.",
    expectedRecovery: "Prove the operation receipt, Jury state/version and DomainEvent committed exactly once, then replay the original durable result on an exact retry.",
    evidence: [
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      ".github/scripts/v3-s11-lost-response-rehearsal.sh",
      "scripts/v3-drop-upstream-response-proxy.mjs",
      "src/lib/v3-s11-lost-response-rehearsal.test.ts",
      "src/lib/v3-reliability-slo.ts",
    ],
    remainingGap:
      "The deterministic post-commit response-loss rehearsal is implemented, but exact-SHA local execution evidence still needs to be retained by the QA/release evidence lane.",
    productionTrafficRequired: false,
  },
  {
    scenario: "stale_projection",
    state: "rehearsal_ready",
    injection: "Delete one derived Organizer Task while preserving its canonical inactive Solaris scheduler-job source.",
    expectedRecovery: "Run the edition-bounded Organizer Task rebuild and verify semantic convergence against the pre-corruption projection.",
    evidence: [
      "src/lib/v3-projection-reconciliation-registry.ts",
      "src/lib/v3-recovery-guardrails.ts",
      "docs/runbooks/projection-outbox-recovery.md",
      "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
      ".github/scripts/v3-s11-stale-projection-rehearsal.sh",
      "src/lib/v3-s11-stale-projection-rehearsal.test.ts",
    ],
    remainingGap:
      "The deterministic local stale-projection rehearsal is implemented, but exact-SHA execution evidence still needs to be retained by the QA/release evidence lane.",
    productionTrafficRequired: false,
  },
  {
    scenario: "reconciliation_retry",
    state: "rehearsal_ready",
    injection: "Force the first Organizer Task projection rebuild to fail at the projection write boundary, then retry the same canonical rebuild path.",
    expectedRecovery: "Rollback the failed repair subtransaction, retain canonical source truth, then converge exactly once on retry without duplicate task state.",
    evidence: [
      ".github/scripts/v3-operation-receipt-rehearsal.sh",
      "src/lib/v3-recovery-guardrails.ts",
      "src/lib/v3-projection-reconciliation-registry.ts",
      ".github/scripts/v3-s11-stale-projection-rehearsal.sh",
      "src/lib/v3-s11-stale-projection-rehearsal.test.ts",
    ],
    remainingGap:
      "The deterministic local reconciliation-retry rehearsal is implemented, but exact-SHA execution evidence still needs to be retained by the QA/release evidence lane.",
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
      "The scenario and measurements exist, but a deterministic backlog-drain rehearsal still needs to be implemented and then executed with retained exact-SHA evidence.",
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
    rehearsal_ready: 0,
    partial: 0,
    contract_only: 0,
    missing: 0,
  };
  for (const entry of V3_FAILURE_INJECTION_COVERAGE) counts[entry.state] += 1;

  return {
    schemaVersion: 2 as const,
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
