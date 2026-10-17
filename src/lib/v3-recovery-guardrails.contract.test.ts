import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const runbook = source("docs/runbooks/projection-outbox-recovery.md");
const evidenceGenerator = source("scripts/generate-v3-recovery-readiness.ts");

describe("System V3 S11 recovery guardrail artifacts", () => {
  it("keeps recovery evidence generation local, registry-derived and exact-SHA identified", () => {
    expect(evidenceGenerator).toContain("buildV3RecoveryReadinessReport");
    expect(evidenceGenerator).toContain("validateV3ProjectionReconciliationRegistry");
    expect(evidenceGenerator).toContain('requiredEnvironment("V3_RECOVERY_EVIDENCE_SHA")');
    expect(evidenceGenerator).toContain('requiredEnvironment("V3_RECOVERY_EVIDENCE_ENVIRONMENT")');
    expect(evidenceGenerator).toContain("exact 40-character commit SHA");
    expect(evidenceGenerator).toContain("V3_RECOVERY_EVIDENCE_OUTPUT");
    expect(evidenceGenerator).not.toContain("supabase.co");
    expect(evidenceGenerator).not.toContain("fetch(");
  });

  it("forbids ad-hoc canonical mutation and unbounded rebuilds", () => {
    expect(runbook).toContain("Do **not** repair canonical workflow truth with ad-hoc");
    expect(runbook).toContain("The planner refuses global recovery");
    expect(runbook).toContain("Batch planning is capped at 25");
    expect(runbook).toContain("Do not turn the runbook into a shadow schema migration");
  });

  it("requires exact dead-letter verification and poison-event stop conditions", () => {
    expect(runbook).toContain("exact `(event_id, consumer_key)` delivery");
    expect(runbook).toContain("exactly one immutable consumer receipt");
    expect(runbook).toContain("stop blind replay");
  });

  it("prohibits machine-driven recovery rehearsals against production", () => {
    expect(runbook).toContain("must use local or otherwise isolated test infrastructure");
    expect(runbook).toContain("must never generate machine-driven traffic against the hosted Solaris Studio production Supabase project");
  });
});
