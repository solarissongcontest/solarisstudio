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
const capacityHarness = source(".github/scripts/v3-s12-local-capacity-rehearsal.mjs");
const evidenceGenerator = source("scripts/generate-v3-failure-injection-coverage.ts");

describe("System V3 S11 deterministic failure-injection coverage", () => {
  it("covers every required reliability failure class exactly once", () => {
    expect(validateV3FailureInjectionCoverage()).toEqual([]);
    expect(V3_FAILURE_INJECTION_COVERAGE.map((entry) => entry.scenario).sort()).toEqual(
      [...V3_FAILURE_INJECTION_SCENARIOS].sort(),
    );
  });

  it("proves generic event-consumer failure, retry, dead-letter and explicit recovery from retained S4 evidence", () => {
    expect(s4Rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(s4Rehearsal).toContain("attempt ceiling did not dead-letter delivery");
    expect(s4Rehearsal).toContain("studio2_requeue_dead_letter_domain_event");
    expect(s4Rehearsal).toContain("requeued delivery could not be claimed");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "event_consumer_failure")?.state,
    ).toBe("rehearsed");
  });

  it("keeps duplicate delivery partial because current S4 evidence suppresses duplicate delivery rather than processing one twice", () => {
    expect(s4Rehearsal).toContain("Semantic replay reuses the same event and does not duplicate deliveries");
    expect(s4Rehearsal).toContain("duplicate completion was not reported as replay");
    const duplicate = V3_FAILURE_INJECTION_COVERAGE.find(
      (entry) => entry.scenario === "duplicate_delivery",
    );
    expect(duplicate?.state).toBe("partial");
    expect(duplicate?.remainingGap).toContain("does not inject the same event into consequence processing twice");
  });

  it("keeps unavailable dependency partial because DEPENDENCY_FAILURE is recorded directly rather than caused by an outage", () => {
    expect(s4Rehearsal).toContain("'DEPENDENCY_FAILURE'");
    const dependency = V3_FAILURE_INJECTION_COVERAGE.find(
      (entry) => entry.scenario === "unavailable_dependency",
    );
    expect(dependency?.state).toBe("partial");
    expect(dependency?.remainingGap).toContain("does not make a real consumer dependency unavailable");
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
  });

  it("records timeout uncertainty but does not overclaim an end-to-end transient RPC rehearsal", () => {
    expect(s2Rehearsal).toContain("studio2_mark_operation_uncertain");
    expect(s2Rehearsal).toContain("'TIMEOUT'");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "transient_rpc_failure")?.state,
    ).toBe("partial");
  });

  it("keeps stale projection and reconciliation retry non-green until dedicated local recovery rehearsals exist", () => {
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "stale_projection")?.state,
    ).toBe("contract_only");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "reconciliation_retry")?.state,
    ).toBe("partial");
  });

  it("keeps backlog drain as an evidence gap even though the capacity harness can measure it", () => {
    expect(capacityHarness).toContain("peakObservedQueueDepth");
    expect(capacityHarness).toContain("retryPressure");
    const backlog = V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "queue_backlog");
    expect(backlog?.state).toBe("contract_only");
  });

  it("binds generated evidence to an exact clean checkout and creates output directories", () => {
    expect(evidenceGenerator).toContain('execFileSync("git", ["rev-parse", "HEAD"]');
    expect(evidenceGenerator).toContain('"status", "--porcelain=v1", "--untracked-files=all"');
    expect(evidenceGenerator).toContain("exact-SHA evidence requires a clean index and worktree");
    expect(evidenceGenerator).toContain("does not match checked-out commit");
    expect(evidenceGenerator).toContain("mkdirSync(dirname(absoluteOutputPath), { recursive: true })");
  });

  it("emits an honest release-evidence report without making a certification claim", () => {
    const report = buildV3FailureInjectionCoverageReport();
    expect(report.counts.rehearsed).toBe(1);
    expect(report.counts.partial).toBe(5);
    expect(report.counts.contract_only).toBe(2);
    expect(report.counts.missing).toBe(0);
    expect(report.unresolved.map((item) => item.scenario).sort()).toEqual([
      "duplicate_delivery",
      "lost_response_after_commit",
      "queue_backlog",
      "reconciliation_retry",
      "stale_projection",
      "transient_rpc_failure",
      "unavailable_dependency",
    ]);
    expect(report.productionTrafficRequired).toBe(false);
    expect(report.certificationClaim).toBe(false);
  });
});
