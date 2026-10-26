import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const operation = source(
  "supabase/migrations/20261003015000_organisation_os_v5_participation_status_operations.sql",
);
const runtime = source(
  "supabase/migrations/20261026194500_v3_s15_participation_consequences.sql",
);

describe("System V3 S15 participation consequences", () => {
  it("keeps the existing versioned R2 command as the authoritative producer", () => {
    expect(operation).toContain("public.studio2_apply_participation_status(");
    expect(operation).toContain("private.studio2_claim_operation(");
    expect(operation).toContain("'participation.status.' || p_status");
    expect(operation).toContain("pg_advisory_xact_lock(");
    expect(operation).toContain("private.studio2_complete_operation");
    expect(runtime).not.toContain("create or replace function public.studio2_apply_participation_status");
  });

  it("treats legitimate withdrawal/disqualification as domain state, not blocker state", () => {
    expect(runtime).toContain("A legitimate withdrawn/disqualified status is NOT a blocker");
    expect(runtime).toContain("cardinality(participant_state.participant_statuses) > 1");
    expect(runtime).toContain("participant_state.participant_statuses[1] is distinct from entry_state.entry_statuses[1]");
    expect(runtime).not.toContain("where participant.participation_status in ('withdrawn', 'disqualified')");
  });

  it("ignores non-participation entry workflow statuses when comparing canonical state", () => {
    expect(runtime).toContain("where entry.status in ('confirmed', 'withdrawn', 'disqualified')");
    expect(runtime).not.toContain("where entry.status = 'pending'");
  });

  it("derives and repairs the declared participation.blocker task deterministically", () => {
    expect(runtime).toContain("private.studio2_reconcile_participation_blocker_tasks");
    expect(runtime).toContain("'participation.blocker'");
    expect(runtime).toContain("'participation_drift'");
    expect(runtime).toContain("'entry.approve'");
    expect(runtime).toContain("'/admin/participant-status/' || edition.slug");
    expect(runtime).toContain("on conflict (source_key) do update");
  });

  it("registers participation repair in the aggregate rebuild path", () => {
    expect(runtime).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(runtime).toContain("private.studio2_reconcile_selection_review_tasks(p_edition_id)");
    expect(runtime).toContain("private.studio2_reconcile_participation_blocker_tasks(p_edition_id)");
    expect(runtime).toContain("private.v3_resolve_archived_edition_workflow_tasks");
  });

  it("emits the completed fact exactly from successful participation operations", () => {
    expect(runtime).toContain("new.status <> 'succeeded' or old.status = 'succeeded'");
    expect(runtime).toContain("'participation.status.confirmed'");
    expect(runtime).toContain("'participation.status.withdrawn'");
    expect(runtime).toContain("'participation.status.disqualified'");
    expect(runtime).toContain("'participation.changed'");
    expect(runtime).toContain("new.operation_id");
    expect(runtime).toContain("array['system.tasks']::text[]");
    expect(runtime).toContain("Participation operation command/result mismatch");
  });

  it("reuses the shared leased task consumer rather than inventing another delivery path", () => {
    expect(runtime).toContain("private.v3_event_requires_shared_task_reconciliation");
    expect(runtime).toContain("'participation.changed'");
    expect(runtime).not.toContain("create table private.v3_domain_event_outbox");
    expect(runtime).not.toContain("create table private.v3_domain_event_consumer_receipts");
  });

  it("marks participation.changed event-backed only with runtime evidence", () => {
    const consequence = v3DomainConsequence("participation.changed");
    expect(consequence?.ownerDomain).toBe("participation");
    expect(consequence?.implementationState).toBe("event-backed");
    expect(consequence?.taskEffects).toEqual([
      { effect: "re-evaluate", taskType: "participation.blocker" },
    ]);
  });
});
