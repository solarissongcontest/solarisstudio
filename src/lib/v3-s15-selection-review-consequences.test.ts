import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261026193000_v3_s15_selection_review_consequences.sql",
);
const reviewAuthority = source(
  "supabase/migrations/20261018024500_v3_entry_review_conflict_http409.sql",
);
const winnerAuthority = source(
  "supabase/migrations/20261003180000_organisation_os_v5_selection_review_transitions.sql",
);

describe("System V3 S15 selection review consequences", () => {
  it("keeps the existing server-authoritative review and winner commands as the producer boundary", () => {
    expect(reviewAuthority).toContain("private.studio2_claim_operation(");
    expect(reviewAuthority).toContain("'entry.request_changes'");
    expect(reviewAuthority).toContain("'entry.accept'");
    expect(reviewAuthority).toContain("private.studio2_complete_operation");
    expect(winnerAuthority).toContain("'confirmation.nf_winner.' || v_action");
    expect(winnerAuthority).toContain("private.studio2_complete_operation");
    expect(migration).not.toContain("create or replace function public.studio2_apply_confirmation_entry_review");
    expect(migration).not.toContain("create or replace function public.studio2_apply_confirmation_winner_change");
  });

  it("emits completed-fact selection events only after successful operation completion", () => {
    expect(migration).toContain("new.status <> 'succeeded' or old.status = 'succeeded'");
    expect(migration).toContain("'selection.reviewed'");
    expect(migration).toContain("'selection.winner_changed'");
    expect(migration).toContain("new.operation_id");
    expect(migration).toContain("array['system.tasks']::text[]");
    expect(migration).not.toContain("request_selection_review");
    expect(migration).not.toContain("select_selection_winner");
  });

  it("does not confuse generic Entry operations with national-selection review", () => {
    expect(migration).toContain(
      "coalesce(new.result ->> 'targetType', '') in ('internal', 'national_final')",
    );
    expect(migration).toContain("'selection_entry'");
    expect(migration).toContain("'national_final'");
  });

  it("derives selection.review_required from canonical pending review rows", () => {
    expect(migration).toContain("private.studio2_reconcile_selection_review_tasks");
    expect(migration).toContain("entry.review_status = 'pending'");
    expect(migration).toContain("submission.selection_method = 'internal'");
    expect(migration).toContain("submission.selection_method = 'national_final'");
    expect(migration).toContain("'selection.review_required'");
    expect(migration).toContain("'confirmation.manage'");
    expect(migration).toContain("'/confirmations/admin/responses/' || submission.id::text");
  });

  it("registers selection review in the aggregate reconciliation and Archive invariant", () => {
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.studio2_reconcile_selection_review_tasks(p_edition_id)");
    expect(migration).toContain("confirmation|entry|selection|media");
    expect(migration).toContain("private.v3_resolve_archived_edition_workflow_tasks");
  });

  it("uses the shared leased/idempotent task consumer rather than a second delivery system", () => {
    expect(migration).toContain("'edition.transitioned'");
    expect(migration).toContain("'selection.reviewed'");
    expect(migration).toContain("'selection.winner_changed'");
    expect(migration).toContain("private.v3_event_requires_shared_task_reconciliation");
    expect(migration).not.toContain("create table private.v3_domain_event_outbox");
    expect(migration).not.toContain("create table private.v3_domain_event_consumer_receipts");
  });

  it("does not create a second public accepted-winner projection", () => {
    expect(migration).not.toContain("create table public.selection_projection");
    expect(migration).not.toContain("create table public.selection_winners");
    expect(migration).toContain("Public readback remains");
  });

  it("registers both selection events as event-backed only with this runtime evidence", () => {
    expect(v3DomainConsequence("selection.reviewed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("selection.winner_changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("selection.reviewed")?.taskEffects).toEqual([
      { effect: "re-evaluate", taskType: "selection.review_required" },
    ]);
  });
});
