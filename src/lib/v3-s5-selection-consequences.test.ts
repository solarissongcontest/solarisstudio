import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261018084500_v3_s5_selection_consequences.sql",
);
const ownerCutover = source(
  "supabase/migrations/20261018084600_v3_selection_country_winner_cutover.sql",
);
const completeWinnerAuthority = source(
  "supabase/migrations/20261018084700_v3_selection_complete_winner_authority.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-selection-consequences-rehearsal.sh",
);
const secondaryRehearsal = source(
  ".github/scripts/v3-s5-selection-winner-secondary-rehearsal.sh",
);
const entryS5 = source(
  "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
);
const selectionAuthority = source(
  "supabase/migrations/20261014030000_v3_entry_review_binding.sql",
);

describe("System V3 S5 National Selection consequences", () => {
  it("reuses the canonical Entry review success boundary for National Final reviews", () => {
    expect(migration).toContain("new.command in (");
    expect(migration).toContain("'entry.request_changes'");
    expect(migration).toContain("'entry.accept'");
    expect(migration).toContain("'entry.remove'");
    expect(migration).toContain("'entry.reset_review'");
    expect(migration).toContain("v_target_type <> 'national_final'");
    expect(migration).toContain("'selection.reviewed'");
    expect(migration).toContain("'selection_review'");
    expect(migration).toContain("array['selection.tasks']::text[]");

    expect(entryS5).toContain("'entry.reviewed'");
    expect(entryS5).toContain("'entry.changes_requested'");
  });

  it("binds Selection review facts to the exact current immutable Entry revision", () => {
    expect(migration).toContain("entry.current_version_id = v_entry_version_id");
    expect(migration).toContain("submission.id = v_submission_id");
    expect(migration).toContain("'entryVersionId', v_entry_version_id");
    expect(migration).not.toContain("'reason', new.result");
  });

  it("observes the existing R2 National Final winner operations", () => {
    expect(selectionAuthority).toContain("'confirmation.nf_winner.' || v_action");
    expect(selectionAuthority).toContain("p_expected_entry_version");
    expect(selectionAuthority).toContain(
      "v_entry.reviewed_version_id is distinct from v_entry.current_version_id",
    );

    expect(migration).toContain("'confirmation.nf_winner.select'");
    expect(migration).toContain("'confirmation.nf_winner.clear'");
    expect(migration).toContain("'selection.winner_changed'");
    expect(migration).toContain("'national_selection'");
    expect(migration).toContain("final.winning_entry_id is not distinct from v_winner_entry_id");
    expect(migration).toContain("entry.reviewed_version_id = entry.current_version_id");
  });

  it("extends the same winner authority to the exact active country owner", () => {
    expect(ownerCutover).toContain("private.v3_country_account_owns_confirmation_nf");
    expect(ownerCutover).toContain("account.status = 'active'");
    expect(ownerCutover).toContain("nf.submission_id is not null");
    expect(ownerCutover).toContain("private.studio2_request_is_service_role()");
    expect(ownerCutover).toContain("public.studio2_access_allowed(");
    expect(ownerCutover).toContain("'confirmation.manage'");
    expect(ownerCutover).toContain("Only an accepted active National Final candidate on its exact reviewed revision can be selected as winner");
  });

  it("closes the country and compatibility writer bypasses for Confirmation-backed winners", () => {
    expect(ownerCutover).toContain("create or replace function public.set_country_national_final_winner(");
    expect(ownerCutover).toContain("v_nf.submission_id is not null");
    expect(ownerCutover).toContain("v_nf.source is distinct from 'manual'");
    expect(ownerCutover).toContain(
      "Confirmation-backed National Final winners must use the canonical Selection operation",
    );
    expect(ownerCutover).toContain(
      "revoke all on function public.set_confirmation_national_final_winner_from_solaris(uuid, uuid)",
    );
    expect(ownerCutover).toContain("from public, anon, authenticated, service_role");
  });

  it("moves historical restore behind one R2 S2 envelope while retaining a compatibility adapter", () => {
    expect(completeWinnerAuthority).toContain(
      "rename to admin_restore_confirmation_version_legacy_impl",
    );
    expect(completeWinnerAuthority).toContain(
      "revoke all on function public.admin_restore_confirmation_version_legacy_impl(uuid, uuid, text)",
    );
    expect(completeWinnerAuthority).toContain("studio2_confirmation_restore_preview");
    expect(completeWinnerAuthority).toContain("studio2_apply_confirmation_restore");
    expect(completeWinnerAuthority).toContain("private.studio2_claim_operation(");
    expect(completeWinnerAuthority).toContain("'entry.restore_version'");
    expect(completeWinnerAuthority).toContain("p_expected_version");
    expect(completeWinnerAuthority).toContain("VERSION_CONFLICT");
    expect(completeWinnerAuthority).toContain(
      "create or replace function public.admin_restore_confirmation_version(",
    );
    expect(completeWinnerAuthority).toContain("public.studio2_apply_confirmation_restore(");
  });

  it("emits winner facts for Confirmation edit and historical restore without inventing task work", () => {
    expect(completeWinnerAuthority).toContain("new.command = 'confirmation.submit'");
    expect(completeWinnerAuthority).toContain("public.submission_versions");
    expect(completeWinnerAuthority).toContain("version.version = v_edit_count");
    expect(completeWinnerAuthority).toContain("'source','confirmation.submit'");
    expect(completeWinnerAuthority).toContain("new.command = 'entry.restore_version'");
    expect(completeWinnerAuthority).toContain("'source','entry.restore_version'");
    expect(completeWinnerAuthority).toContain("'selection.winner_changed'");
    expect(completeWinnerAuthority).toContain("array[]::text[]");
  });

  it("uses one monotonic Confirmation review version axis across Selection winner mutations", () => {
    expect(completeWinnerAuthority).toContain("studio2_confirmation_review_versions");
    expect(completeWinnerAuthority).toContain("v_review_version");
    expect(completeWinnerAuthority).toContain("v_current_version");
    expect(completeWinnerAuthority).not.toContain("create table public.selection_versions");
  });

  it("does not fabricate winner-review task work", () => {
    expect(migration).toContain("v_consumers := array[]::text[]");
    expect(migration).toContain("v_consumers := array['selection.tasks']::text[]");
    expect(migration).toContain("studio2_process_selection_domain_event");
    expect(migration).toContain("v_event.event_type <> 'selection.reviewed'");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("keeps Selection DomainEvent payloads free of Organizer reasons and content snapshots", () => {
    const emitStart = migration.indexOf("create or replace function private.v3_emit_selection_operation_event");
    const processorStart = migration.indexOf("create or replace function public.studio2_process_selection_domain_event");
    const emitSource = migration.slice(emitStart, processorStart);
    expect(emitSource).not.toContain("artist_snapshot");
    expect(emitSource).not.toContain("song_title_snapshot");
    expect(emitSource).not.toContain("p_reason");
    expect(emitSource).not.toContain("review_reason");

    const secondaryStart = completeWinnerAuthority.indexOf(
      "create or replace function private.v3_emit_selection_secondary_winner_event",
    );
    const secondarySource = completeWinnerAuthority.slice(secondaryStart);
    expect(secondarySource).not.toContain("artist_snapshot");
    expect(secondarySource).not.toContain("song_title_snapshot");
    expect(secondarySource).not.toContain("review_reason");
  });

  it("keeps hostile Selection proof local-only and replay-aware", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("selection.reviewed");
    expect(rehearsal).toContain("selection.winner_changed");
    expect(rehearsal).toContain("same NF review operation lost its Entry-domain fact");
    expect(rehearsal).toContain("review replay duplicated selection.reviewed");
    expect(rehearsal).toContain("winner change fabricated Selection task work");
    expect(rehearsal).toContain("country owner preview did not resolve canonical winner state");
    expect(rehearsal).toContain("legacy Confirmation winner sync writer remains callable");
    expect(rehearsal).toContain("selection-task-reconciliation");

    expect(secondaryRehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(secondaryRehearsal).toContain("Refusing non-local database rehearsal");
    expect(secondaryRehearsal).toContain("Confirmation edit winner delta did not emit selection.winner_changed");
    expect(secondaryRehearsal).toContain("historical restore winner clear did not emit selection.winner_changed");
    expect(secondaryRehearsal).toContain("restore replay duplicated Selection winner fact");
    expect(secondaryRehearsal).toContain("legacy restore implementation remains browser callable");
  });
});
