import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_FAILURE_INJECTION_COVERAGE } from "./v3-failure-injection-coverage";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-unavailable-dependency-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 unavailable-dependency recovery rehearsal", () => {
  it("hard-refuses hosted Supabase and binds evidence to a clean exact SHA", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(rehearsal).toContain("V3_S11_DEPENDENCY_SHA");
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("git status --porcelain --untracked-files=all");
  });

  it("uses a real loopback TCP/HTTP dependency rather than a synthetic outage flag", () => {
    expect(rehearsal).toContain('python3 -m http.server "$DEPENDENCY_PORT"');
    expect(rehearsal).toContain("--bind 127.0.0.1");
    expect(rehearsal).toContain('kill "$DEPENDENCY_PID"');
    expect(rehearsal).toContain("dependency outage injection failed; health probe still succeeded");
    expect(rehearsal).not.toContain("V3_FAKE_DEPENDENCY_OUTAGE");
  });

  it("creates the delivery through a governed R2 operation instead of direct outbox insertion", () => {
    expect(rehearsal).toContain("studio2_apply_jury_voting_status");
    expect(rehearsal).toContain("event_type='jury.closed'");
    expect(rehearsal).not.toContain("insert into private.v3_domain_event_outbox");
    expect(rehearsal).not.toContain("update private.v3_domain_event_outbox");
  });

  it("classifies the observed outage through the canonical retry contract", () => {
    expect(rehearsal).toContain("studio2_claim_domain_event_deliveries");
    expect(rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(rehearsal).toContain("'DEPENDENCY_FAILURE'");
    expect(rehearsal).toContain("last_error_code='DEPENDENCY_FAILURE'");
    expect(rehearsal).toContain("consumer receipt appeared even though the dependency was unavailable");
  });

  it("restores the same dependency and proves one canonical converged effect", () => {
    expect(rehearsal).toContain("Restoring the same dependency endpoint");
    expect(rehearsal).toContain("studio2_process_jury_domain_event");
    expect(rehearsal).toContain("attempt_count=2");
    expect(rehearsal).toContain("exactly one immutable receipt");
    expect(rehearsal).toContain("recovery duplicated or lost the canonical DomainEvent");
  });

  it("marks the scenario rehearsal-ready, not rehearsed, until exact-SHA execution evidence is retained", () => {
    const dependency = V3_FAILURE_INJECTION_COVERAGE.find(
      (entry) => entry.scenario === "unavailable_dependency",
    );
    expect(dependency?.state).toBe("rehearsal_ready");
    expect(dependency?.remainingGap).toContain("exact-SHA local execution evidence");
    expect(dependency?.productionTrafficRequired).toBe(false);
  });
});
