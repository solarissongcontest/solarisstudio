import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const finalFix = readFileSync(
  'supabase/migrations/20261021163000_v3_s14_failed_task_delivery_evidence.sql',
  'utf8',
);
const taskRehearsal = readFileSync(
  '.github/scripts/v3-s14-archive-task-resurrection-rehearsal.sh',
  'utf8',
);

describe('System V3 S14 final Archive terminal boundary', () => {
  it('freezes the remaining edition-scoped participation/configuration stores', () => {
    for (const table of [
      'televoting_round_bindings',
      'studio2_next_in_line_windows',
      'next_in_line_responses',
      'studio2_eligibility_overrides',
    ]) {
      expect(finalFix).toContain(`'${table}'`);
    }
    expect(finalFix).toContain(
      'private.v3_guard_archived_edition_workflow_write()',
    );
    expect(finalFix).toContain('before insert or update or delete');
  });

  it('freezes canonical Televote workflow and result storage through bound Solaris edition scope', () => {
    expect(finalFix).toContain('private.v3_televote_row_solaris_editions');
    expect(finalFix).toContain('public.televoting_round_bindings');
    expect(finalFix).toContain('binding.remote_round_id');
    expect(finalFix).toContain('binding.remote_edition_id');
    expect(finalFix).toContain('private.v3_guard_archived_televote_write()');
    expect(finalFix).toContain('for no key update');

    for (const table of [
      'rounds',
      'round_countries',
      'round_entries',
      'round_results',
      'vote_submissions',
      'vote_entries',
      'televote_aggregations',
      'televote_aggregation_sources',
      'televote_aggregation_participants',
      'combined_televote_results',
      'combined_televote_component_results',
    ]) {
      expect(finalFix).toContain(`'${table}'`);
    }
  });

  it('leaves integrity and audit stores outside the Televote current-workflow freeze', () => {
    for (const table of [
      'vote_integrity_decisions',
      'vote_moderation_events',
      'vote_preflight_checks',
      'voter_sanctions',
      'anti_abuse_events',
      'integrity_action_audit',
    ]) {
      expect(finalFix).not.toContain(`'${table}'`);
    }
  });

  it('uses a private transaction gate so canonical task rebuilds converge without weakening direct history guards', () => {
    expect(finalFix).toContain('private.v3_archive_task_reconciliation_gates');
    expect(finalFix).toContain('transaction_id = txid_current()');
    expect(finalFix).toContain(
      'private.v3_archive_task_reconciliation_gate_active',
    );
    expect(finalFix).toContain(
      "raise exception 'Archived edition workflow task history is read-only.'",
    );
    expect(finalFix).toContain('return null;');
    expect(finalFix).toContain(
      'create or replace function private.studio2_reconcile_all_organizer_tasks',
    );
    expect(finalFix).toContain(
      'grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)',
    );
  });

  it('rehearses repeated aggregate reconciliation while preserving governance work and resolution evidence', () => {
    expect(taskRehearsal).toContain(
      'Canonical aggregate reconciliation converges repeatedly after Archive',
    );
    expect(
      taskRehearsal.match(/studio2_reconcile_all_organizer_tasks/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(taskRehearsal).toContain(
      'aggregate reconciliation rewrote archived blocker resolution timestamp',
    );
    expect(taskRehearsal).toContain(
      'aggregate reconciliation suppressed legitimate incident governance work',
    );
  });
});
