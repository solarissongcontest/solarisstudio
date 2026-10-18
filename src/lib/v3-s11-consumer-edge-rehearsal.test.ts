import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_FAILURE_INJECTION_COVERAGE } from "./v3-failure-injection-coverage";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-consumer-edge-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 duplicate-delivery and dependency-outage rehearsal", () => {
  it("hard-refuses hosted targets and pre-existing unconsumed Jury work", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(rehearsal).toContain("unconsumed jury.tasks deliveries");
  });

  it("injects duplicate delivery by invoking the actual Jury consumer twice for one event", () => {
    expect(rehearsal).toContain("studio2_process_jury_domain_event");
    expect(rehearsal).toContain("v3-s11-duplicate-first");
    expect(rehearsal).toContain("v3-s11-duplicate-second");
    expect(rehearsal).toContain("duplicate Jury consumer delivery did not converge through replay");
    expect(rehearsal).toContain("duplicate delivery changed Organizer Task consequence state");
    expect(rehearsal).toContain("duplicate delivery created more than one immutable consumer receipt");
    expect(rehearsal).toContain("duplicate consumer invocation fabricated an additional queue claim");
  });

  it("makes the real Jury task dependency unavailable rather than directly labelling an error", () => {
    expect(rehearsal).toContain("rename to studio2_reconcile_all_organizer_tasks_v3_s11_unavailable");
    expect(rehearsal).toContain("exception when undefined_function");
    expect(rehearsal).toContain("Synthetic dependency outage did not reach Jury consumer");
    expect(rehearsal).toContain("canonical Jury task reconciliation dependency was not restored");
  });

  it("records the observed dependency outage through canonical S4 failure and bounded retry", () => {
    expect(rehearsal).toContain("studio2_fail_domain_event_delivery");
    expect(rehearsal).toContain("'DEPENDENCY_FAILURE'");
    expect(rehearsal).toContain("canonical dependency failure did not schedule a retry");
    expect(rehearsal).toContain("v3-s11-dependency-retry");
    expect(rehearsal).toContain("dependency recovery did not complete on the second bounded attempt");
    expect(rehearsal).toContain("dependency recovery did not converge on exactly one immutable consumer receipt");
  });

  it("marks both newly implemented edge failures rehearsal-ready pending retained local execution", () => {
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "duplicate_delivery")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "unavailable_dependency")?.state,
    ).toBe("rehearsal_ready");
  });
});
