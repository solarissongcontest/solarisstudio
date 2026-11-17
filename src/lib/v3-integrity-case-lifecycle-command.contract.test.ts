import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020005500_integrity_case_lifecycle_commands.sql",
  ),
  "utf8",
);
const client = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-case-lifecycle.ts"),
  "utf8",
);

function section(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 Integrity case lifecycle authority", () => {
  it("registers an additive S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261020005500_integrity_case_lifecycle_commands");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|schema)\b/i);
  });

  it("versions the case aggregate across lifecycle dependencies", () => {
    expect(migration).toContain("create table if not exists public.studio2_integrity_case_versions");
    for (const trigger of [
      "studio2_integrity_case_touch_version",
      "studio2_integrity_finding_touch_case_version",
      "studio2_integrity_sanction_touch_case_version",
      "studio2_integrity_appeal_touch_case_version",
      "studio2_integrity_reviewer_touch_case_version",
      "studio2_integrity_request_touch_case_version",
    ]) {
      expect(migration).toContain(trigger);
    }
  });

  it("preflights findings, sanctions, appeals, requests and reviewer conflict state", () => {
    const context = section(
      "create or replace function private.studio2_integrity_case_transition_context(",
      "revoke all on function private.studio2_integrity_case_transition_context",
    );
    expect(context).toContain("studio2_access_allowed('integrity.manage', null, false)");
    expect(context).toContain("appeal.status in ('submitted', 'under_review')");
    expect(context).toContain("request_row.status = 'open'");
    expect(context).toContain("reviewer.recused_at is not null");
    expect(context).toContain("'expectedVersion', v_version");
    expect(context).toContain("'riskClass', v_risk");
    expect(context).toContain("'blockers', v_blockers");
  });

  it("requires outcome-compatible closure and refuses to bypass unresolved work", () => {
    expect(migration).toContain("A no-violation finding is required for closed_no_violation.");
    expect(migration).toContain("An insufficient-evidence finding is required for closed_insufficient_evidence.");
    expect(migration).toContain("An outside-jurisdiction finding is required for closed_outside_jurisdiction.");
    expect(migration).toContain("A duplicate finding is required for closed_duplicate.");
    expect(migration).toContain("Resolve all submitted or under-review appeals before closing the case.");
    expect(migration).toContain("Resolve or close outstanding case requests before closing the case.");
    expect(migration).toContain("You are recused from this Integrity case and cannot change its lifecycle state.");
  });

  it("uses expected-version CAS, semantic idempotency and authoritative receipts", () => {
    const apply = section(
      "create or replace function public.studio2_apply_integrity_case_transition(",
      "revoke all on function public.studio2_apply_integrity_case_transition",
    );
    expect(apply).toContain("'integrity.case_transition'");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("for update;");
    expect(apply).toContain("if p_expected_version <> v_version then");
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(apply).toContain("'receiptId', v_operation_id");
  });

  it("commits legacy history, audit and canonical DomainEvent/outbox consequences with the transition", () => {
    const apply = section(
      "create or replace function public.studio2_apply_integrity_case_transition(",
      "revoke all on function public.studio2_apply_integrity_case_transition",
    );
    expect(apply).toContain("insert into public.integrity_case_events");
    expect(apply).toContain("'status.changed'");
    expect(apply).toContain("insert into public.admin_audit_log");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("'integrity.case_changed'");
    expect(apply).toContain("array['integrity.tasks']::text[]");
    expect(apply).toContain("private.studio2_reconcile_all_organizer_tasks(null)");
  });

  it("provides a replay-safe service-role outbox consumer for task reconciliation", () => {
    const consumer = section(
      "create or replace function public.studio2_process_integrity_domain_event(",
      "revoke all on function public.studio2_process_integrity_domain_event",
    );
    expect(consumer).toContain("private.studio2_request_is_service_role()");
    expect(consumer).toContain("p_consumer_key <> 'integrity.tasks'");
    expect(consumer).toContain("private.v3_domain_event_consumer_receipts");
    expect(consumer).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(consumer).toContain("private.studio2_reconcile_all_organizer_tasks(null)");
    expect(consumer).toContain("public.studio2_complete_domain_event_delivery(");
  });

  it("ships a typed client that rejects contradictory subject/status/version receipt evidence", () => {
    expect(client).toContain('"studio2_integrity_case_transition_preview"');
    expect(client).toContain('"studio2_apply_integrity_case_transition"');
    expect(client).toContain("preview.caseId !== caseId");
    expect(client).toContain("preview.targetStatus !== input.targetStatus");
    expect(client).toContain('receipt.command !== "integrity.case_transition"');
    expect(client).toContain("receipt.caseId !== caseId");
    expect(client).toContain("receipt.status !== input.targetStatus");
    expect(client).toContain("receipt.previousVersion !== input.expectedVersion");
  });
});
