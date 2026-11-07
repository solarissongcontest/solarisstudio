import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const authority = source("supabase/migrations/20261021110000_v3_s14_archive_guard_authority_forward_fix.sql");
const convergence = source("supabase/migrations/20261021202000_v3_s14_archive_reconciliation_convergence.sql");
const failedEvidence = source("supabase/migrations/20261021163000_v3_s14_failed_task_delivery_evidence.sql");
const guardTest = source(".github/scripts/v3-s14-archive-delete-guard-rehearsal.sh");
const taskTest = source(".github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh");
const workflow = source(".github/workflows/v3-s14-archive-system-rehearsal.yml");

describe("V3 S14 Archive one-shot authority and scoped consequence verification", () => {
  it("preserves the canonical private, consumed, transaction-bound Archive gate", () => {
    expect(authority).toContain("private.v3_archive_runtime_transition_gates");
    expect(authority).toContain("private.v3_arm_archive_runtime_transition_gate");
    expect(authority).toContain("txid_current()");
    expect(authority).toContain("transaction_id = txid_current()");
    expect(authority).toContain("returning edition_id into v_gate_edition_id");
    expect(authority).toContain("Archive transition must use the canonical V3 lifecycle command.");
    expect(authority).toContain("set schema private");
    expect(authority).toContain("revoke all on table private.v3_archive_runtime_transition_gates");
    expect(authority).toContain("from public, anon, authenticated, service_role");
    expect(authority).not.toContain("current_setting('solaris.v3_archive_command'");
  });

  it("tests cross-edition and stale-transaction gate denial using a rollback-only local fixture", () => {
    expect(guardTest).toContain("BEGIN;");
    expect(guardTest).toContain("ROLLBACK;");
    expect(guardTest).toContain("canonical Archive consumes its one-shot edition gate");
    expect(guardTest).toContain("a gate for edition A cannot archive edition B");
    expect(guardTest).toContain("wrong-transaction gate cannot archive its own edition");
    expect(guardTest).toContain("txid_current() + 1");
    expect(guardTest).toContain("A gate for Edition A changed the lifecycle state of Edition B");
    expect(guardTest).toContain("private Archive gate cannot be armed or forged by browser or service roles");
    expect(guardTest).toContain("cross-edition and stale-capability tests remove all injected gate records");
    expect(guardTest).toContain("'42501'");
    expect(guardTest).toContain("Archive transition must use the canonical V3 lifecycle command.");
    expect(guardTest).toContain("Refusing hosted Supabase rehearsal");
    expect(guardTest).toContain("Refusing non-local database rehearsal");
  });

  it("keeps archive task reconciliation fenced to the chosen edition", () => {
    expect(convergence).toContain("private.v3_archive_task_reconciliation_gates");
    expect(convergence).toContain("perform private.v3_resolve_archived_edition_workflow_tasks(p_edition_id)");
    expect(convergence).toContain("perform private.v3_reconcile_resolved_task_notifications(p_edition_id)");
    expect(convergence).toContain("perform private.studio2_prune_stale_task_notifications(p_edition_id)");
    expect(failedEvidence).toContain("delivery.status in ('pending', 'processing')");
    expect(taskTest).toContain("CONTROL_EDITION_ID");
    expect(taskTest).toContain("CONTROL_TASK_ID");
    expect(taskTest).toContain("CONTROL_SOURCE_KEY");
    expect(taskTest).toContain("Archive consequence reconciliation must not affect a different active edition");
    expect(taskTest).toContain("Archive resolved unrelated control task");
    expect(taskTest).toContain("Archive suppressed unrelated control Inbox");
    expect(taskTest).toContain("Archive suppressed unrelated control delivery");
    expect(taskTest).toContain("repeat scoped Task reconcile resolved unrelated active work");
    expect(taskTest).toContain("repeat scoped Task reconcile suppressed control Inbox");
    expect(taskTest).toContain("repeat scoped Task reconcile suppressed control delivery");
    expect(taskTest).toContain("task resolution rewrote historical failed-delivery evidence");
  });

  it("requires clean-replay and current-main upgrade against isolated local Supabase", () => {
    expect(workflow).toContain("clean-replay:");
    expect(workflow).toContain("upgrade-from-main:");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).toContain("v3-s14-archive-delete-guard-rehearsal.sh");
    expect(workflow).toContain("v3-s14-archive-task-resurrection-rehearsal.sh");
    expect(workflow).toContain("v3-start-disposable-supabase.sh");
    expect(workflow).toContain("supabase stop --no-backup");
  });
});
