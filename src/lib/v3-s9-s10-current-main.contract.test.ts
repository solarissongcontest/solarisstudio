import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const workflow = read("supabase/migrations/20261024200000_v3_s9_s10_workflow_observability.sql");
const review = read("supabase/migrations/20261024200100_v3_s9_s10_observability_review_fixes.sql");
const authority = read("supabase/migrations/20261024200200_v3_s9_s10_observability_authority_fixes.sql");
const juryEvent = read("supabase/migrations/20261024200300_v3_s9_jury_submit_event_validation.sql");

function body(source: string, signature: string, delimiter: string) {
  const start = source.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf(`as $${delimiter}$`, start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(`$${delimiter}$;`, bodyStart + delimiter.length + 5);
  expect(end).toBeGreaterThan(bodyStart);
  return source.slice(start, end + delimiter.length + 3);
}

describe("current-main S9/S10 workflow observability authority", () => {
  it("keeps the four reviewed semantic S13 contracts on fresh forward migrations", () => {
    expect(workflow).toContain("'v3.s9-s10.workflow-observability-v1'");
    expect(review).toContain("'v3.s9-s10.workflow-observability-review-fix-v1'");
    expect(authority).toContain("'v3.s9-s10.workflow-observability-authority-fix-v2'");
    expect(juryEvent).toContain("'v3.s9.jury-submit-event-validation-v1'");
    for (const migration of [workflow, review, authority, juryEvent]) {
      expect(migration).toContain("'forward_fix_only'");
      expect(migration).not.toMatch(/https:\/\/[^\s'\"]+\.supabase\.co/i);
    }
  });

  it("keeps workflow observability bounded, low-cardinality and system.read gated", () => {
    const snapshot = body(workflow, "public.admin_system_workflow_observability_snapshot(", "workflow_snapshot");
    expect(snapshot).toContain("studio2_access_allowed('system.read', null, false)");
    expect(snapshot).toContain("p_lookback_minutes not between 5 and 10080");
    expect(snapshot).toContain("'classification', 'fixed_low_cardinality'");
    expect(snapshot).not.toContain("'actorId'");
    expect(snapshot).not.toContain("'payload'");
  });

  it("uses advancing wall-clock timing and does not invent latency for malformed historical samples", () => {
    expect(review).toContain("alter column created_at set default clock_timestamp()");
    expect(review).toContain("studio2_operation_receipts_wallclock_completion");
    expect(authority).toContain("before insert on public.studio2_operation_receipts");
    const snapshot = body(authority, "public.admin_system_workflow_observability_snapshot(", "workflow_snapshot");
    expect(snapshot).toContain("operation.completed_at >= operation.created_at");
    expect(snapshot).toContain("'operationLatencySamples'");
  });

  it("measures the real participant Jury submit command through S2 instead of relabelling Organizer commands", () => {
    const submit = body(authority, "public.v3_submit_jury_ballot(", "jury_submit");
    expect(authority).toContain("rename to v3_submit_jury_ballot_legacy_impl");
    expect(submit).toContain("private.studio2_claim_operation(");
    expect(submit).toContain("'jury.submit'");
    expect(submit).toContain("public.v3_submit_jury_ballot_legacy_impl(");
    expect(submit).toContain("private.studio2_complete_operation(_operation_id, v_result)");
    const classifier = body(authority, "private.v3_observability_workflow_class(", "workflow");
    expect(classifier).toContain("p_command = 'jury.submit'");
    expect(classifier).toContain("p_command like 'jury.window.%'");
    expect(classifier).not.toContain("then 'projection_reconciliation'");
  });

  it("fails malformed Jury ballots before array access and emits only the canonical existing consequence fact", () => {
    const gate = body(juryEvent, "public.v3_submit_jury_ballot(", "jury_submit_gate");
    const typeCheck = gate.indexOf("jsonb_typeof(_entries) is distinct from 'array'");
    const lengthCheck = gate.indexOf("jsonb_array_length(_entries) < 1");
    expect(typeCheck).toBeGreaterThanOrEqual(0);
    expect(lengthCheck).toBeGreaterThan(typeCheck);
    expect(gate).toContain("pg_column_size(_entries) > 131072");

    const bridge = body(juryEvent, "private.v3_emit_jury_submission_event()", "jury_submit_event");
    expect(bridge).toContain("new.command <> 'jury.submit'");
    expect(bridge).toContain("new.status <> 'succeeded'");
    expect(bridge).toContain("private.v3_emit_domain_event(");
    expect(bridge).toContain("'jury.ballot_changed'");
    expect(juryEvent).not.toContain("'jury.ballot_submitted'");
    expect(juryEvent).not.toContain("insert into public.jury_votes");
  });
});
