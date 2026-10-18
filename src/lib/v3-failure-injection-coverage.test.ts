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

const s4Rehearsal = source(".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh");
const staleProjectionRehearsal = source(".github/scripts/v3-s11-stale-projection-rehearsal.sh");
const lostResponseRehearsal = source(".github/scripts/v3-s11-lost-response-rehearsal.sh");
const responseDropProxy = source("scripts/v3-drop-upstream-response-proxy.mjs");
const capacityHarness = source(".github/scripts/v3-s12-local-capacity-rehearsal.mjs");
const evidenceGenerator = source("scripts/generate-v3-failure-injection-coverage.ts");

describe("System V3 S11 deterministic failure-injection coverage", () => {
  it("covers every required reliability failure class exactly once", () => {
    expect(validateV3FailureInjectionCoverage()).toEqual([]);
    expect(V3_FAILURE_INJECTION_COVERAGE.map((entry) => entry.scenario).sort()).toEqual(
      [...V3_FAILURE_INJECTION_SCENARIOS].sort(),
    );
  });

  it("retains already-executed S4 failure/replay coverage separately", () => {
    expect(s4Rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(s4Rehearsal).toContain("'DEPENDENCY_FAILURE'");
    expect(s4Rehearsal).toContain("studio2_requeue_dead_letter_domain_event");
    expect(s4Rehearsal).toContain("duplicate completion was not reported as replay");
  });

  it("marks stale projection and reconciliation retry rehearsal-ready pending retained execution evidence", () => {
    expect(staleProjectionRehearsal).toContain("V3_S11_SYNTHETIC_PROJECTION_WRITE_FAILURE");
    expect(staleProjectionRehearsal).toContain("Retry did not restore exactly one fixture task");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "stale_projection")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "reconciliation_retry")?.state,
    ).toBe("rehearsal_ready");
  });

  it("marks real transport failure and lost response rehearsal-ready only with the governed loopback injection path", () => {
    expect(lostResponseRehearsal).toContain("studio2_apply_jury_voting_status");
    expect(lostResponseRehearsal).toContain("client unexpectedly received a normal response instead of a transport failure");
    expect(lostResponseRehearsal).toContain("committed R2 operation receipt missing after response loss");
    expect(responseDropProxy).toContain('upstreamResponse.on("end"');
    expect(responseDropProxy).toContain("clientResponse.socket?.destroy()");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "lost_response_after_commit")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "transient_rpc_failure")?.state,
    ).toBe("rehearsal_ready");
  });

  it("keeps backlog drain as the only contract-only gap", () => {
    expect(capacityHarness).toContain("peakObservedQueueDepth");
    expect(capacityHarness).toContain("retryPressure");
    const backlog = V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "queue_backlog");
    expect(backlog?.state).toBe("contract_only");
    expect(backlog?.remainingGap).toContain("still needs to be implemented");
  });

  it("binds generated evidence to the checked-out SHA and creates output directories", () => {
    expect(evidenceGenerator).toContain('execFileSync("git", ["rev-parse", "HEAD"]');
    expect(evidenceGenerator).toContain("does not match checked-out commit");
    expect(evidenceGenerator).toContain("mkdirSync(dirname(absoluteOutputPath), { recursive: true })");
  });

  it("reports implemented-but-unexecuted rehearsals separately from retained rehearsed evidence", () => {
    const report = buildV3FailureInjectionCoverageReport();
    expect(report.schemaVersion).toBe(2);
    expect(report.counts.rehearsed).toBe(3);
    expect(report.counts.rehearsal_ready).toBe(4);
    expect(report.counts.partial).toBe(0);
    expect(report.counts.contract_only).toBe(1);
    expect(report.counts.missing).toBe(0);
    expect(report.unresolved.map((item) => item.scenario).sort()).toEqual([
      "lost_response_after_commit",
      "queue_backlog",
      "reconciliation_retry",
      "stale_projection",
      "transient_rpc_failure",
    ]);
    expect(report.productionTrafficRequired).toBe(false);
    expect(report.certificationClaim).toBe(false);
  });
});
