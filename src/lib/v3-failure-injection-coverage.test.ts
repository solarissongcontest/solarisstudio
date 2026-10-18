import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_FAILURE_INJECTION_COVERAGE,
  V3_FAILURE_INJECTION_SCENARIOS,
  buildV3FailureInjectionCoverageReport,
  validateV3FailureInjectionCoverage,
} from "./v3-failure-injection-coverage";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const s2Rehearsal = source(".github/scripts/v3-operation-receipt-rehearsal.sh");
const s4Rehearsal = source(".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh");
const staleProjectionRehearsal = source(".github/scripts/v3-s11-stale-projection-rehearsal.sh");
const capacityHarness = source(".github/scripts/v3-s12-local-capacity-rehearsal.mjs");
const evidenceGenerator = source("scripts/generate-v3-failure-injection-coverage.ts");

describe("System V3 S11 deterministic failure-injection coverage", () => {
  it("covers every required reliability failure class exactly once", () => {
    expect(validateV3FailureInjectionCoverage()).toEqual([]);
    expect(V3_FAILURE_INJECTION_COVERAGE.map((entry) => entry.scenario).sort()).toEqual(
      [...V3_FAILURE_INJECTION_SCENARIOS].sort(),
    );
  });

  it("proves event-consumer failure, retry, dead-letter and explicit recovery from the local S4 rehearsal", () => {
    expect(s4Rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(s4Rehearsal).toContain("'DEPENDENCY_FAILURE'");
    expect(s4Rehearsal).toContain("attempt ceiling did not dead-letter delivery");
    expect(s4Rehearsal).toContain("studio2_requeue_dead_letter_domain_event");
    expect(s4Rehearsal).toContain("requeued delivery could not be claimed");
  });

  it("proves duplicate event/completion replay converges without duplicated delivery state", () => {
    expect(s4Rehearsal).toContain("Semantic replay reuses the same event and does not duplicate deliveries");
    expect(s4Rehearsal).toContain("semantic replay duplicated delivery state");
    expect(s4Rehearsal).toContain("duplicate completion was not reported as replay");
    expect(s4Rehearsal).toContain("consumer idempotency receipt missing");
  });

  it("proves committed operation replay semantics but does not call that a lost-response injection", () => {
    expect(s2Rehearsal).toContain("Replaying the same normalized request with a new operation id");
    expect(s2Rehearsal).toContain("replay did not return original operation");
    expect(s2Rehearsal).toContain("replay lost completed result");
    expect(s2Rehearsal).toContain("IDEMPOTENCY_CONFLICT");
    const lostResponse = V3_FAILURE_INJECTION_COVERAGE.find(
      (entry) => entry.scenario === "lost_response_after_commit",
    );
    expect(lostResponse?.state).toBe("partial");
    expect(lostResponse?.remainingGap).toContain("does not actually discard or interrupt");
  });

  it("records timeout uncertainty but does not overclaim an end-to-end transient RPC rehearsal", () => {
    expect(s2Rehearsal).toContain("studio2_mark_operation_uncertain");
    expect(s2Rehearsal).toContain("'TIMEOUT'");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "transient_rpc_failure")?.state,
    ).toBe("partial");
  });

  it("marks stale projection and reconciliation retry rehearsed only with dedicated local recovery evidence", () => {
    expect(staleProjectionRehearsal).toContain("V3_S11_SYNTHETIC_PROJECTION_WRITE_FAILURE");
    expect(staleProjectionRehearsal).toContain("Retry did not restore exactly one fixture task");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "stale_projection")?.state,
    ).toBe("rehearsed");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "reconciliation_retry")?.state,
    ).toBe("rehearsed");
  });

  it("keeps backlog drain as an evidence gap even though the capacity harness can measure it", () => {
    expect(capacityHarness).toContain("peakObservedQueueDepth");
    expect(capacityHarness).toContain("retryPressure");
    const backlog = V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "queue_backlog");
    expect(backlog?.state).toBe("contract_only");
    expect(backlog?.remainingGap).toContain("has not yet been executed");
  });

  it("binds generated evidence to the checked-out SHA and creates output directories", () => {
    expect(evidenceGenerator).toContain('execFileSync("git", ["rev-parse", "HEAD"]');
    expect(evidenceGenerator).toContain("does not match checked-out commit");
    expect(evidenceGenerator).toContain("mkdirSync(dirname(absoluteOutputPath), { recursive: true })");
  });

  it("emits a release-evidence report without making a certification claim", () => {
    const report = buildV3FailureInjectionCoverageReport();
    expect(report.counts.rehearsed).toBe(5);
    expect(report.counts.partial).toBe(2);
    expect(report.counts.contract_only).toBe(1);
    expect(report.counts.missing).toBe(0);
    expect(report.unresolved.map((item) => item.scenario).sort()).toEqual([
      "lost_response_after_commit",
      "queue_backlog",
      "transient_rpc_failure",
    ]);
    expect(report.productionTrafficRequired).toBe(false);
    expect(report.certificationClaim).toBe(false);
  });
});
